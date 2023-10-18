import { pipe, flow, constant } from "fp-ts/function";
import * as S from "fp-ts/Separated";
import * as A from "fp-ts/Array";
import * as O from "fp-ts/Option";
import * as R from "fp-ts/Record";
import * as NEA from "fp-ts/NonEmptyArray";

const Database = {
  products: {
    "001": {
      name: "Cola",
      price: 45,
    },
    "002": {
      name: "Royal",
      price: 50,
    },
    "003": {
      name: "Sprite",
      price: 55,
    },
    "004": {
      name: "Fanta",
      price: 60,
    },
    "005": {
      name: "Lemon Tea",
      price: 35,
    },
  },
};

type Product = {
  name: string;
  price: number;
};

type IDatabase = {
  products: {
    [key: string]: Product;
  };
};

const cart = ["003", "002", "003", "003", "004", "006"];

type FormattedOrder = {
  id: string;
  name: string;
  originalPrice: number;
  discountedPrice: number;
  quantity: number;
  activatedOfCoupon: string[];
};

function prop<T, K extends keyof T>(k: K): (obj: T) => T[K] {
  return (obj) => obj[k];
}

const getProduct = (database: IDatabase) => (id: string) =>
  pipe(
    //
    O.fromNullable(database.products[id]),
    O.map((product) => ({ ...product, id }))
  );

const initOrder = (
  products: NEA.NonEmptyArray<Product & { id: string }>
): FormattedOrder => ({
  id: products[0].id,
  name: products[0].name,
  originalPrice: products[0].price,
  discountedPrice: products[0].price,
  quantity: products.length,
  activatedOfCoupon: [],
});

const groupByCart = (database: IDatabase) => (itemIds: string[]) =>
  pipe(
    //
    itemIds,
    A.map(getProduct(database)),
    A.compact,
    NEA.groupBy(prop("id")),
    R.map(initOrder),
    Object.values<FormattedOrder>
  );

const applyCouponOneNotDiscounted = (order: FormattedOrder) =>
  pipe(
    //
    order,
    (order) => ({
      ...order,
      quantity: Math.floor(order.quantity / 2),
      activatedOfCoupon: A.append("couponOne-notDiscounted")(
        order.activatedOfCoupon
      ),
    })
  );

const applyCouponOneDiscounted = (order: FormattedOrder) =>
  pipe(
    //
    order,
    (order) => ({
      ...order,
      quantity: Math.floor(order.quantity / 2),
      discountedPrice: order.discountedPrice / 2,
      activatedOfCoupon: A.append("couponOne-discounted")(
        order.activatedOfCoupon
      ),
    })
  );

const unapplyCouponOneItem = (count: number) => (order: FormattedOrder) =>
  pipe(
    //
    order,
    (order) => ({
      ...order,
      quantity: 1,
    }),
    O.fromPredicate(constant(count % 2 === 1)),
    O.match(constant([]), A.of)
  );

const couponOne = (orders: FormattedOrder[]) =>
  pipe(
    orders,
    A.partition(flow(prop("quantity"), (quantity) => quantity >= 2)),
    S.map(
      flow(
        A.flatMap((order) => [
          applyCouponOneNotDiscounted(order),
          applyCouponOneDiscounted(order),
          ...unapplyCouponOneItem(order.quantity)(order),
        ])
      )
    ),
    ({ left, right }) => A.concat(left)(right)
  );

const canTriggerCouponTwo = flow(
  A.reduce(0, (acc, order: FormattedOrder) =>
    order.activatedOfCoupon.length === 0 ? acc + order.quantity : acc
  ),
  (count) => count >= 3
);

const applyCouponTwoDiscount = (order: FormattedOrder) =>
  pipe(
    //
    order,
    (order) => ({
      ...order,
      discountedPrice: order.discountedPrice - 5,
      activatedOfCoupon: A.append("couponOne-discounted")(
        order.activatedOfCoupon
      ),
    })
  );

const couponTwoDiscount = (orders: FormattedOrder[]) =>
  pipe(
    //
    orders,
    A.partition(
      flow(prop("activatedOfCoupon"), prop("length"), (count) => count === 0)
    ),
    S.map(A.map(applyCouponTwoDiscount))
  );

const couponTwo = (orders: FormattedOrder[]) =>
  pipe(
    //
    orders,
    O.fromPredicate(canTriggerCouponTwo),
    O.map(couponTwoDiscount),
    O.match(constant(orders), ({ left, right }) => A.concat(left)(right))
  );

const applyCoupon = (database: IDatabase) => (cart: string[]) =>
  pipe(cart, groupByCart(database), couponOne, couponTwo);

const checkout = (database: IDatabase) => (cart: string[]) =>
  pipe(
    cart,
    applyCoupon(database),
    A.reduce(0, (acc, order) => acc + order.discountedPrice * order.quantity)
  );
