import { Hono } from "hono";
import type { RoomController } from "../controllers/room.controller.js";

export function createRoomRoutes(controller: RoomController): Hono {
  const router = new Hono();

  router.post("/rooms", controller.create);
  router.get("/rooms/:id/validate", controller.validate);

  return router;
}
