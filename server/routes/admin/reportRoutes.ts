import type { Router } from 'express';
import { z } from 'zod';
import { requirePermission } from '../../auth.js';
import { getCollections } from '../../db.js';
import { ApiError } from '../../errors.js';
import { orderJson } from '../../serialize.js';
import { id } from '../../validation.js';
import { dateRange } from '../../time.js';

export function registerReportRoutes(router: Router): void {
  router.get('/reports/history', requirePermission(['order-history', 'sports-order-history']), async (req, res) => {
    const query = z.object({
      courtId: id.optional(),
      status: z.enum(['all', 'new', 'accepted', 'preparing', 'delivered', 'cancelled', 'paid_cash', 'paid_transfer']).optional(),
      paymentStatus: z.enum(['all', 'unpaid', 'paid']).optional(),
      paymentMethod: z.enum(['all', 'cash', 'transfer']).optional(),
      orderType: z.enum(['all', 'drinks', 'sports_pos']).optional().default('all'),
      timePreset: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      search: z.string().optional(),
      before: z.iso.datetime().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(100),
      page: z.coerce.number().int().min(1).optional(),
      cursor: id.optional()
    }).parse(req.query);

    const perms: string[] = res.locals.permissions || [];
    const envAdminUser = process.env.ADMIN_USERNAME || 'admin';
    const isSuperAdmin = perms.includes('*') || (res.locals.admin === envAdminUser && !res.locals.userId) || res.locals.roleId === 'admin';
    const canDrinks = isSuperAdmin || perms.includes('order-history');
    const canSports = isSuperAdmin || perms.includes('sports-order-history');

    if (!canDrinks && !canSports) {
      throw new ApiError(403, 'FORBIDDEN', 'Bạn không có quyền truy cập lịch sử đơn hàng');
    }

    if (!canDrinks && canSports) {
      if (query.orderType === 'drinks') {
        throw new ApiError(403, 'FORBIDDEN', 'Bạn không có quyền xem lịch sử đơn nước');
      }
      query.orderType = 'sports_pos';
    } else if (canDrinks && !canSports) {
      if (query.orderType === 'sports_pos') {
        throw new ApiError(403, 'FORBIDDEN', 'Bạn không có quyền xem lịch sử đơn thể thao');
      }
      query.orderType = 'drinks';
    }

    const baseFilter: Record<string, unknown> = {};
    if (query.courtId && query.courtId !== 'all') baseFilter.courtId = query.courtId;

    if (query.orderType === 'drinks') {
      baseFilter.orderType = { $ne: 'sports_pos' };
    } else if (query.orderType === 'sports_pos') {
      baseFilter.orderType = 'sports_pos';
    }

    if (query.status === 'paid_cash') {
      baseFilter.status = 'delivered';
      baseFilter.paymentStatus = 'paid';
      baseFilter.paymentMethod = { $in: ['cash', null, undefined] };
    } else if (query.status === 'paid_transfer') {
      baseFilter.status = 'delivered';
      baseFilter.paymentStatus = 'paid';
      baseFilter.paymentMethod = 'transfer';
    } else if (query.status && query.status !== 'all') {
      baseFilter.status = query.status;
    }

    if (query.paymentMethod && query.paymentMethod !== 'all') {
      if (query.paymentMethod === 'cash') {
        baseFilter.paymentMethod = { $in: ['cash', null, undefined] };
      } else {
        baseFilter.paymentMethod = query.paymentMethod;
      }
      baseFilter.paymentStatus = 'paid';
    }

    if (query.paymentStatus && query.paymentStatus !== 'all' && !baseFilter.paymentStatus) {
      baseFilter.paymentStatus = query.paymentStatus;
    }

    if (query.startDate || query.endDate) {
      const dateFilter: Record<string, Date> = {};
      if (query.startDate) dateFilter.$gte = new Date(query.startDate + 'T00:00:00+07:00');
      if (query.endDate) dateFilter.$lte = new Date(query.endDate + 'T23:59:59.999+07:00');
      baseFilter.createdAt = dateFilter;
    } else if (query.timePreset && ['today', 'yesterday', '7days', 'month'].includes(query.timePreset)) {
      baseFilter.createdAt = dateRange(query.timePreset as any);
    }

    if (query.search && query.search.trim()) {
      const q = query.search.trim();
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      baseFilter.$or = [
        { displayCode: regex },
        { 'items.nameSnapshot': regex },
        { courtNameSnapshot: regex },
        { customerName: regex },
        { customerPhone: regex }
      ];
    }

    const c = getCollections();

    // Aggregate summary stats for the filtered set (without pagination cursor)
    const [summaryAgg] = await c.orders.aggregate([
      { $match: baseFilter },
      {
        $facet: {
          stats: [
            {
              $group: {
                _id: null,
                totalOrders: { $sum: 1 },
                totalRevenueVnd: {
                  $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, '$totalVnd', 0] }
                }
              }
            }
          ],
          bottles: [
            { $unwind: '$items' },
            {
              $group: {
                _id: null,
                totalBottles: { $sum: '$items.quantity' },
                totalIce: { $sum: '$items.iceQuantity' },
                totalCostVnd: {
                  $sum: {
                    $cond: [
                      { $eq: ['$status', 'delivered'] },
                      { $multiply: [{ $ifNull: ['$items.costPriceVnd', 0] }, '$items.quantity'] },
                      0
                    ]
                  }
                }
              }
            }
          ]
        }
      }
    ]).toArray();

    const totalMatched = summaryAgg?.stats?.[0]?.totalOrders || 0;
    const totalRevenueVnd = summaryAgg?.stats?.[0]?.totalRevenueVnd || 0;
    const totalBottles = summaryAgg?.bottles?.[0]?.totalBottles || 0;
    const totalCostVnd = summaryAgg?.bottles?.[0]?.totalCostVnd || 0;
    const totalProfitVnd = Math.max(0, totalRevenueVnd - totalCostVnd);

    const queryFilter: Record<string, unknown> = { ...baseFilter };
    if (query.cursor) {
      const cursorOrder = await c.orders.findOne({ orderId: query.cursor });
      if (!cursorOrder) throw new ApiError(400, 'INVALID_CURSOR', 'Mốc lịch sử không hợp lệ');
      const cursorCond = [{ createdAt: { $lt: cursorOrder.createdAt } }, { createdAt: cursorOrder.createdAt, orderId: { $lt: cursorOrder.orderId } }];
      if (queryFilter.$or) {
        queryFilter.$and = [{ $or: queryFilter.$or }, { $or: cursorCond }];
        delete queryFilter.$or;
      } else {
        queryFilter.$or = cursorCond;
      }
    }

    const pageNumber = query.page || 1;
    const pageSize = query.limit;
    const skip = query.cursor ? 0 : (pageNumber - 1) * pageSize;
    const list = await c.orders.find(queryFilter).sort({ createdAt: -1, orderId: -1 }).skip(skip).limit(pageSize + 1).toArray();
    const page = list.slice(0, pageSize);

    res.json({
      orders: page.map(orderJson),
      nextCursor: list.length > pageSize ? page.at(-1)!.orderId : null,
      totalMatched,
      page: pageNumber,
      totalPages: Math.ceil(totalMatched / pageSize) || 1,
      limit: pageSize,
      summary: {
        totalRevenueVnd,
        totalCostVnd,
        totalProfitVnd,
        totalBottles
      }
    });
  });

  router.get('/reports/summary', requirePermission('revenue-report'), async (req, res) => {
    const timeFilter = z.enum(['today', 'yesterday', '7days', 'month', 'all']).default('today').parse(req.query.timeFilter);
    const categoryFilter = z.enum(['all', 'drinks', 'sports', 'service']).default('all').parse(req.query.categoryFilter || 'all');
    const c = getCollections();

    const matchStage: any = { status: 'delivered', deliveredAt: dateRange(timeFilter) };
    if (categoryFilter === 'drinks') {
      matchStage.orderType = { $ne: 'sports_pos' };
    } else if (categoryFilter === 'sports' || categoryFilter === 'service') {
      matchStage.orderType = 'sports_pos';
    }

    const pipeline = [{ $match: matchStage }, {
      $facet: {
        totals: [{
          $group: {
            _id: null,
            orders: { $sum: 1 },
            deliveredRevenue: { $sum: '$totalVnd' },
            paidRevenue: {
              $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$totalVnd', 0] }
            },
            unpaidDebt: {
              $sum: { $cond: [{ $ne: ['$paymentStatus', 'paid'] }, '$totalVnd', 0] }
            },
            unpaidOrdersCount: {
              $sum: { $cond: [{ $ne: ['$paymentStatus', 'paid'] }, 1, 0] }
            }
          }
        }],
        courts: [
          {
            $group: {
              _id: '$courtId',
              name: { $last: '$courtNameSnapshot' },
              revenue: { $sum: '$totalVnd' },
              paidRevenue: {
                $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$totalVnd', 0] }
              },
              ordersCount: { $sum: 1 }
            }
          },
          { $sort: { revenue: -1 } }
        ],
        products: [
          { $unwind: '$items' },
          ...(categoryFilter !== 'all' ? [{
            $match: {
              'items.itemType': categoryFilter === 'drinks' ? { $in: ['drink', null] } : categoryFilter
            }
          }] : []),
          {
            $group: {
              _id: '$items.productId',
              name: { $last: '$items.nameSnapshot' },
              unit: { $last: '$items.volumeSnapshot' },
              itemType: { $last: { $ifNull: ['$items.itemType', 'drink'] } },
              quantity: { $sum: '$items.quantity' },
              ice: { $sum: '$items.iceQuantity' },
              revenue: { $sum: '$items.lineTotalVnd' },
              cost: { $sum: { $multiply: [{ $ifNull: ['$items.costPriceVnd', 0] }, '$items.quantity'] } }
            }
          },
          { $sort: { revenue: -1 } }
        ],
        breakdown: [
          { $unwind: '$items' },
          {
            $group: {
              _id: { $ifNull: ['$items.itemType', 'drink'] },
              revenue: { $sum: '$items.lineTotalVnd' },
              paidRevenue: {
                $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$items.lineTotalVnd', 0] }
              },
              cost: { $sum: { $multiply: [{ $ifNull: ['$items.costPriceVnd', 0] }, '$items.quantity'] } },
              quantity: { $sum: '$items.quantity' }
            }
          }
        ],
        paymentMethods: [
          { $match: { paymentStatus: 'paid' } },
          {
            $group: {
              _id: { $ifNull: ['$paymentMethod', 'cash'] },
              revenue: { $sum: '$totalVnd' },
              count: { $sum: 1 }
            }
          }
        ],
        paymentMethodsByDomain: [
          { $match: { paymentStatus: 'paid' } },
          { $unwind: '$items' },
          {
            $group: {
              _id: {
                itemType: { $ifNull: ['$items.itemType', 'drink'] },
                method: { $ifNull: ['$paymentMethod', 'cash'] }
              },
              revenue: { $sum: '$items.lineTotalVnd' },
              quantity: { $sum: '$items.quantity' }
            }
          }
        ]
      }
    }];

    const paidInPeriodMatch: any = {
      paymentStatus: 'paid',
      paidAt: dateRange(timeFilter)
    };
    if (categoryFilter === 'drinks') {
      paidInPeriodMatch.orderType = { $ne: 'sports_pos' };
    } else if (categoryFilter === 'sports' || categoryFilter === 'service') {
      paidInPeriodMatch.orderType = 'sports_pos';
    }

    const [[summary], [pending], [unpaid], [collectedInPeriod]] = await Promise.all([
      c.orders.aggregate(pipeline).toArray(),
      c.orders.aggregate([{ $match: { status: { $in: ['new', 'accepted', 'preparing'] } } }, { $group: { _id: null, total: { $sum: '$totalVnd' }, count: { $sum: 1 } } }]).toArray(),
      c.orders.aggregate([{ $match: { paymentStatus: 'unpaid', status: { $ne: 'cancelled' } } }, { $group: { _id: null, total: { $sum: '$totalVnd' }, count: { $sum: 1 } } }]).toArray(),
      c.orders.aggregate([
        { $match: paidInPeriodMatch },
        {
          $facet: {
            methods: [
              {
                $group: {
                  _id: { $ifNull: ['$paymentMethod', 'cash'] },
                  revenue: { $sum: '$totalVnd' },
                  count: { $sum: 1 }
                }
              }
            ],
            domains: [
              { $unwind: '$items' },
              {
                $group: {
                  _id: {
                    itemType: { $ifNull: ['$items.itemType', 'drink'] },
                    method: { $ifNull: ['$paymentMethod', 'cash'] }
                  },
                  revenue: { $sum: '$items.lineTotalVnd' }
                }
              }
            ]
          }
        }
      ]).toArray()
    ]);

    const rawProducts = summary?.products || [];
    const products = rawProducts.map((p: any) => {
      const cost = p.cost || 0;
      const revenue = p.revenue || 0;
      const profit = revenue - cost;
      const margin = revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : 0;
      return {
        ...p,
        cost,
        profit,
        profitMargin: margin
      };
    });

    const domainPmList = summary?.paymentMethodsByDomain || [];
    const getDomainMethodRevenue = (domain: string, method: string) => {
      return domainPmList.find((p: any) => p._id?.itemType === domain && p._id?.method === method)?.revenue || 0;
    };

    const periodMethods = collectedInPeriod?.methods || [];
    const periodDomains = collectedInPeriod?.domains || [];
    const getPeriodDomainRevenue = (domain: string, method: string) => {
      return periodDomains.find((p: any) => p._id?.itemType === domain && p._id?.method === method)?.revenue || 0;
    };

    const periodCash = periodMethods.find((p: any) => p._id === 'cash')?.revenue;
    const periodTransfer = periodMethods.find((p: any) => p._id === 'transfer')?.revenue;

    const totalPaidCash = periodCash ?? 0;
    const totalPaidTransfer = periodTransfer ?? 0;

    let cashRevenue = totalPaidCash;
    let transferRevenue = totalPaidTransfer;
    let collectedRevenue = totalPaidCash + totalPaidTransfer;
    let deliveredRevenue = summary?.totals[0]?.deliveredRevenue || 0;
    let unpaidDebtVnd = summary?.totals[0]?.unpaidDebt || 0;

    if (categoryFilter !== 'all') {
      const domainKey = categoryFilter === 'drinks' ? 'drink' : categoryFilter;
      const catPeriodCash = getPeriodDomainRevenue(domainKey, 'cash') ?? 0;
      const catPeriodTransfer = getPeriodDomainRevenue(domainKey, 'transfer') ?? 0;
      cashRevenue = catPeriodCash;
      transferRevenue = catPeriodTransfer;
      collectedRevenue = cashRevenue + transferRevenue;
      deliveredRevenue = products.reduce((acc: number, p: any) => acc + (p.revenue || 0), 0);
      unpaidDebtVnd = Math.max(0, deliveredRevenue - collectedRevenue);
    }

    const totalRevenueVnd = deliveredRevenue;
    const totalCostVnd = products.reduce((acc: number, p: any) => acc + (p.cost || 0), 0);
    const totalProfitVnd = totalRevenueVnd - totalCostVnd;
    const overallMargin = totalRevenueVnd > 0 ? Math.round((totalProfitVnd / totalRevenueVnd) * 1000) / 10 : 0;

    const breakdownRows = summary?.breakdown || [];
    const drinksStat = breakdownRows.find((b: any) => b._id === 'drink') || { revenue: 0, paidRevenue: 0, cost: 0, quantity: 0 };
    const sportsStat = breakdownRows.find((b: any) => b._id === 'sports') || { revenue: 0, paidRevenue: 0, cost: 0, quantity: 0 };
    const serviceStat = breakdownRows.find((b: any) => b._id === 'service') || { revenue: 0, paidRevenue: 0, cost: 0, quantity: 0 };

    const drinksRevenue = drinksStat.revenue || 0;
    const drinksCost = drinksStat.cost || 0;
    const drinksProfit = drinksRevenue - drinksCost;

    const sportsRevenue = sportsStat.revenue || 0;
    const sportsCost = sportsStat.cost || 0;
    const sportsProfit = sportsRevenue - sportsCost;

    const serviceRevenue = serviceStat.revenue || 0;
    const serviceCost = serviceStat.cost || 0;
    const serviceProfit = serviceRevenue - serviceCost;

    res.json({
      timeFilter,
      categoryFilter,
      totalRevenueVnd,
      collectedRevenue,
      deliveredRevenue,
      unpaidDebtVnd,
      totalCostVnd,
      totalProfitVnd,
      totalCashProfitVnd: collectedRevenue - totalCostVnd,
      profitMarginPercent: overallMargin,
      cashRevenue,
      transferRevenue,
      totalOrdersDelivered: summary?.totals[0]?.orders || 0,
      uncollectedRevenueVnd: pending?.total || 0,
      totalOrdersUncollected: pending?.count || 0,
      unpaidRevenueVnd: unpaid?.total || 0,
      unpaidOrdersCount: unpaid?.count || 0,
      periodUnpaidOrdersCount: summary?.totals[0]?.unpaidOrdersCount || 0,
      totalItemsDelivered: products.reduce((n: number, p: { quantity: number }) => n + p.quantity, 0),
      totalBottlesDelivered: drinksStat.quantity || 0,
      breakdown: {
        drinks: {
          revenue: drinksRevenue,
          collectedRevenue: drinksStat.paidRevenue || (getDomainMethodRevenue('drink', 'cash') + getDomainMethodRevenue('drink', 'transfer')),
          cost: drinksCost,
          profit: drinksProfit,
          cashProfit: (drinksStat.paidRevenue || 0) - drinksCost,
          quantity: drinksStat.quantity || 0,
          cashRevenue: getDomainMethodRevenue('drink', 'cash'),
          transferRevenue: getDomainMethodRevenue('drink', 'transfer')
        },
        sports: {
          revenue: sportsRevenue,
          collectedRevenue: sportsStat.paidRevenue || (getDomainMethodRevenue('sports', 'cash') + getDomainMethodRevenue('sports', 'transfer')),
          cost: sportsCost,
          profit: sportsProfit,
          cashProfit: (sportsStat.paidRevenue || 0) - sportsCost,
          quantity: sportsStat.quantity || 0,
          cashRevenue: getDomainMethodRevenue('sports', 'cash'),
          transferRevenue: getDomainMethodRevenue('sports', 'transfer')
        },
        service: {
          revenue: serviceRevenue,
          collectedRevenue: serviceStat.paidRevenue || (getDomainMethodRevenue('service', 'cash') + getDomainMethodRevenue('service', 'transfer')),
          cost: serviceCost,
          profit: serviceProfit,
          cashProfit: (serviceStat.paidRevenue || 0) - serviceCost,
          quantity: serviceStat.quantity || 0,
          cashRevenue: getDomainMethodRevenue('service', 'cash'),
          transferRevenue: getDomainMethodRevenue('service', 'transfer')
        }
      },
      byCourt: summary?.courts || [],
      bestSellers: products
    });
  });
}
