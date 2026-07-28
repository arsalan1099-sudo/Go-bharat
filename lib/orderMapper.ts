import { Order, OrderItem } from "./types";

interface ServerOrderItem {
  id?: string;
  productId?: string;
  productName?: string;
  name?: string;
  quantity?: number;
  price?: number;
  seatNumber?: string;
  seatClass?: string;
}

export interface ServerOrderResponse {
  id: string;
  customerId: string;
  customerName?: string;
  vendorId: string;
  vendorName?: string;
  vendorCategoryId?: string;
  deliveryPartnerId?: string;
  deliveryPartnerName?: string;
  items: ServerOrderItem[] | string;
  status: string;
  totalAmount?: number | string;
  total?: number | string;
  paymentStatus?: string;
  paymentMethod?: string;
  createdAt?: string;
  deliveryAddress?: string;
  address?: string;
  deliveryOTP?: string;
  deliveryNote?: string;
  deliverySpeed?: string;
  assignedAt?: string;
  pickedAt?: string;
  deliveredAt?: string;
}

export function mapServerOrder(o: ServerOrderResponse): Order {
  let rawItems: ServerOrderItem[] = [];
  if (typeof o.items === "string") {
    try {
      rawItems = JSON.parse(o.items);
    } catch {
      rawItems = [];
    }
  } else if (Array.isArray(o.items)) {
    rawItems = o.items;
  }

  const items: OrderItem[] = rawItems.map((i) => ({
    id: i.id || String(Math.random()),
    productId: i.productId || i.id || "",
    productName: i.productName || i.name || "",
    quantity: i.quantity || 1,
    price: i.price || 0,
    seatNumber: i.seatNumber || undefined,
    seatClass: i.seatClass || undefined,
  }));

  return {
    id: o.id,
    customerId: o.customerId,
    customerName: o.customerName || "",
    vendorId: o.vendorId,
    vendorName: o.vendorName || "",
    vendorCategoryId: o.vendorCategoryId || "",
    deliveryPartnerId: o.deliveryPartnerId || undefined,
    deliveryPartnerName: o.deliveryPartnerName || undefined,
    items,
    status: o.status as Order["status"],
    totalAmount: parseFloat(String(o.totalAmount ?? o.total ?? 0)) || 0,
    paymentStatus: (o.paymentStatus || "PENDING") as Order["paymentStatus"],
    paymentMethod: (o.paymentMethod || undefined) as Order["paymentMethod"],
    createdAt: o.createdAt ? new Date(o.createdAt).toISOString() : new Date().toISOString(),
    deliveryAddress: o.deliveryAddress || o.address || "",
    deliveryOTP: o.deliveryOTP || undefined,
    deliveryNote: o.deliveryNote || undefined,
    deliverySpeed: o.deliverySpeed as Order["deliverySpeed"] | undefined,
    assignedAt: o.assignedAt || undefined,
    pickedAt: o.pickedAt || undefined,
    deliveredAt: o.deliveredAt || undefined,
  };
}
