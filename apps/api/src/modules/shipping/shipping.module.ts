import { Module } from '@nestjs/common';

import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { eq, desc, inArray } from 'drizzle-orm';
import { getDb, schema } from '../../db/client';
import { Auth } from '../../common/auth.guard';
import { advanceShipment, dispatchOrder, toggleAutoRun } from './shipping-engine';

@Controller('admin/shipments')
export class ShippingController {
  @Get()
  @Auth('ADMIN')
  list(@Query('status') status?: string) {
    const db = getDb();
    const ships = db.select().from(schema.shipments).orderBy(desc(schema.shipments.id)).all();
    return ships.map((s) => {
      const order = db.select().from(schema.orders).where(eq(schema.orders.id, s.orderId)).get()!;
      return {
        ...s, events: JSON.parse(s.events),
        orderNo: order.orderNo, receiver: order.receiver, orderStatus: order.status,
      };
    }).filter((s) => (status ? s.status === status : true));
  }

  @Post(':orderId/dispatch')
  @Auth('ADMIN')
  dispatch(@Param('orderId') orderId: number) {
    return dispatchOrder(Number(orderId));
  }

  @Post(':id/advance')
  @Auth('ADMIN')
  advance(@Param('id') id: number) {
    return advanceShipment(Number(id));
  }

  @Post('auto-run')
  @Auth('ADMIN')
  autoRun(@Body() body: { on: boolean }) {
    return toggleAutoRun(body.on);
  }
}

@Module({ controllers: [ShippingController] })
export class ShippingModule {}
