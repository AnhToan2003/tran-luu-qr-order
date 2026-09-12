import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { customerSession } from '../auth.js';
import { getCollections } from '../db.js';
import { OrderService } from '../services/orderService.js';
import { orderJson } from '../serialize.js';
export const orderRouter = Router();
orderRouter.get('/my',async(req,res)=>{
  const filter: Record<string, any> = { customerSessionHash: customerSession(req, res) };
  if (typeof req.query.court_code === 'string' && req.query.court_code.trim()) {
    const court = await getCollections().courts.findOne({ code: req.query.court_code.trim() });
    if (court) {
      filter.courtId = court.courtId;
    }
  }
  const orders = await getCollections().orders.find(filter).sort({createdAt:-1}).limit(100).toArray();
  res.json(orders.map(orderJson));
});
orderRouter.post('/',rateLimit({windowMs:60000,limit:60,standardHeaders:'draft-8',legacyHeaders:false}),async(req,res)=>{
  res.status(201).json(orderJson(await OrderService.placeOrder(customerSession(req,res),req.body)));
});
orderRouter.post('/:id/cancel',(_req,res)=>res.status(403).json({code:'CUSTOMER_CANCEL_DISABLED',message:'Khách không được hủy đơn. Vui lòng liên hệ quầy.'}));
orderRouter.patch('/:id',(_req,res)=>res.status(403).json({code:'CUSTOMER_EDIT_DISABLED',message:'Đơn đã gửi không thể chỉnh sửa. Vui lòng liên hệ quầy.'}));
