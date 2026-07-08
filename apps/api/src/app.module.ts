import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from './modules/auth/auth.module';
import { AccountModule } from './modules/account/account.module';
import { ProductsModule } from './modules/products/products.module';
import { CartModule } from './modules/cart/cart.module';
import { WishlistModule } from './modules/wishlist/wishlist.module';
import { CouponsModule } from './modules/coupons/coupons.module';
import { PointsModule } from './modules/points/points.module';
import { OrdersModule } from './modules/orders/orders.module';
import { ClaimsModule } from './modules/claims/claims.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { QnaModule } from './modules/qna/qna.module';
import { ShippingModule } from './modules/shipping/shipping.module';
import { AdminModule } from './modules/admin/admin.module';

@Module({
  imports: [
    JwtModule.register({ global: true, secret: process.env.JWT_SECRET || 'malldemo-demo-secret', signOptions: { expiresIn: '7d' } }),
    AuthModule, AccountModule, ProductsModule, CartModule, WishlistModule,
    CouponsModule, PointsModule, OrdersModule, ClaimsModule, ReviewsModule,
    QnaModule, ShippingModule, AdminModule,
  ],
})
export class AppModule {}
