import { Router, type RequestHandler } from 'express';
import { randomBytes, createHash, scryptSync, timingSafeEqual } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { getDb } from './db.js';
import { ApiError } from './errors.js';
const cookieName = 'tl_admin';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const cookieOptions = () => ({httpOnly:true,secure:process.env.NODE_ENV === 'production',sameSite:'strict' as const,path:'/api/admin'});
export function validateAuthConfig() {
  if (!process.env.ADMIN_PASSWORD_HASH || !/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(process.env.ADMIN_PASSWORD_HASH)) throw new Error('ADMIN_PASSWORD_HASH must be configured before starting.');
}
export const requireAdmin: RequestHandler = async (req,res,next) => {
  const token = req.cookies[cookieName];
  const session = typeof token === 'string' && /^[a-f0-9]{64}$/.test(token)
    ? await getDb().collection('admin_sessions').findOne({tokenHash:hash(token),expiresAt:{$gt:new Date()}}) : null;
  if (!session) throw new ApiError(401,'UNAUTHORIZED','Vui lòng đăng nhập quản trị');
  res.locals.admin = session.username;
  next();
};
export const authRouter = Router();
authRouter.post('/login',rateLimit({windowMs:15*60*1000,limit:15,skipSuccessfulRequests:true,standardHeaders:'draft-8',legacyHeaders:false,message:{code:'TOO_MANY_ATTEMPTS',message:'Thử đăng nhập quá nhiều lần. Vui lòng thử lại sau 15 phút.'}}), async (req,res) => {
  const input = z.object({username:z.string().max(80),password:z.string().min(1).max(256)}).parse(req.body);
  const [salt, stored] = process.env.ADMIN_PASSWORD_HASH!.split(':');
  const valid = timingSafeEqual(scryptSync(input.password,salt,64),Buffer.from(stored,'hex'));
  if (!valid || input.username !== (process.env.ADMIN_USERNAME || 'admin')) throw new ApiError(401,'INVALID_LOGIN','Tên đăng nhập hoặc mật khẩu không đúng');
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now()+12*60*60*1000);
  await getDb().collection('admin_sessions').insertOne({tokenHash:hash(token),username:input.username,expiresAt});
  res.cookie(cookieName,token,{...cookieOptions(),maxAge:12*60*60*1000}).json({username:input.username});
});
authRouter.get('/session',requireAdmin,(_req,res)=>res.json({username:res.locals.admin}));
authRouter.post('/logout', async (req,res)=>{
  if(typeof req.cookies[cookieName] === 'string') await getDb().collection('admin_sessions').deleteOne({tokenHash:hash(req.cookies[cookieName])});
  res.clearCookie(cookieName,cookieOptions()).json({ok:true});
});
export function customerSession(req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1]) {
  const headerSession = req.headers['x-customer-session'];
  if (typeof headerSession === 'string' && /^[a-f0-9]{32,64}$/i.test(headerSession)) {
    return hash(headerSession);
  }
  let token = req.cookies.tl_session;
  if(typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
    token = randomBytes(32).toString('hex');
    res.cookie('tl_session',token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/'});
  }
  return hash(token);
}
