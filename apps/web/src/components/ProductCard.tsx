import { Link } from 'react-router-dom';
import type { Product } from '../api';
import { won } from '../lib/format';

export function ProductCard({ product }: { product: Product }) {
  const discount = product.basePrice > product.salePrice
    ? Math.round((1 - product.salePrice / product.basePrice) * 100) : 0;
  return (
    <Link to={`/products/${product.id}`} className="card overflow-hidden hover:shadow-md transition">
      <div className="aspect-square bg-gray-100 overflow-hidden">
        <img src={product.thumbnailUrl} alt={product.name} className="w-full h-full object-cover" loading="lazy" />
      </div>
      <div className="p-3">
        <div className="text-sm font-medium truncate">{product.name}</div>
        <div className="mt-1 flex items-baseline gap-1">
          <span className="text-lg font-bold text-brand-600">{won(product.salePrice)}</span>
          {discount > 0 && <span className="text-xs text-red-500">{discount}%</span>}
        </div>
        {discount > 0 && <span className="text-xs text-gray-400 line-through">{won(product.basePrice)}</span>}
      </div>
    </Link>
  );
}
