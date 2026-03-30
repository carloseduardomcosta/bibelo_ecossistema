import { beforeAll } from "vitest";
import { dbConnect } from "./db";

beforeAll(async () => {
  await dbConnect();
});
