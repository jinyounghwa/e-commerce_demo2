import { Controller, Get } from '@nestjs/common';
import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { getDb, schema } from '../../db/client';
import { Auth } from '../../common/auth.guard';

@Controller('admin/dashboard')
export class DashboardController {
  @Get()
  @Auth('ADMIN')
  dashboard() {
    const db = getDb();
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const todayStart = todayStr + 'T00:00:00.000Z';
    const todayEnd = todayStr + 'T23:59:59.999Z';

    const allOrders = db.select().from(schema.orders).all();
    const todayOrders = allOrders.filter((o) => o.createdAt >= todayStart && o.createdAt <= todayEnd);
    const todaySales = todayOrders
      .filter((o) => o.status !== 'CANCELED' && o.status !== 'PAYMENT_FAILED')
      .reduce((s, o) => s + o.payAmount, 0);
    const canceledCount = allOrders.filter((o) => o.status === 'CANCELED').length;
    const cancelRate = allOrders.length ? Math.round((canceledCount / allOrders.length) * 1000) / 10 : 0;

    // 최근 7일 매출
    const chart: { date: string; sales: number; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      const dayOrders = allOrders.filter((o) => o.createdAt.slice(0, 10) === ds);
      chart.push({
        date: ds,
        sales: dayOrders.filter((o) => o.status !== 'CANCELED' && o.status !== 'PAYMENT_FAILED')
          .reduce((s, o) => s + o.payAmount, 0),
        count: dayOrders.length,
      });
    }

    // 재고 부족 (stock < 5)
    const lowStock = db.select({
      skuId: schema.skus.id, stock: schema.skus.stock, optionLabel: schema.skus.optionLabel,
      productId: schema.products.id, productName: schema.products.name,
    }).from(schema.skus).innerJoin(schema.products, eq(schema.skus.productId, schema.products.id))
      .where(lt(schema.skus.stock, 5)).all();

    const totalSales = allOrders.filter((o) => o.status !== 'CANCELED' && o.status !== 'PAYMENT_FAILED')
      .reduce((s, o) => s + o.payAmount, 0);

    return {
      todaySales, todayOrderCount: todayOrders.length, cancelRate, totalSales,
      totalOrders: allOrders.length,
      chart,
      lowStock,
    };
  }
}
