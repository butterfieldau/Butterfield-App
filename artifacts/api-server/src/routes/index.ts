import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import productsRouter from "./products.js";
import ordersRouter from "./orders.js";
import loyaltyRouter from "./loyalty.js";
import staffRouter from "./staff.js";
import wholesaleRouter from "./wholesale.js";
import miscRouter from "./misc.js";
import paymentRouter from "./payment.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/products", productsRouter);
router.use("/orders", ordersRouter);
router.use("/loyalty", loyaltyRouter);
router.use("/staff", staffRouter);
router.use("/wholesale", wholesaleRouter);
router.use("/payment", paymentRouter);
router.use(miscRouter);

export default router;
