import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { hashPassword, comparePassword } from "../utils/hash.js";
import { signToken } from "../utils/jwt.js";
import { HTTP } from "../constants/http.js";

export async function signup(req, res) {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res
      .status(HTTP.BAD_REQUEST)
      .json({ error: "username, email, and password are required" });
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) {
    return res.status(HTTP.CONFLICT).json({ error: "Email already in use" });
  }

  const passwordHash = await hashPassword(password);

  const [user] = await db
    .insert(users)
    .values({ username, email, passwordHash })
    .returning({ id: users.id, username: users.username, role: users.role });

  res.status(HTTP.CREATED).json({ token: signToken(user), user });
}

export async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res
      .status(HTTP.BAD_REQUEST)
      .json({ error: "email and password are required" });
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user || user.isDeleted) {
    return res.status(HTTP.UNAUTHORIZED).json({ error: "Invalid credentials" });
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    return res.status(HTTP.UNAUTHORIZED).json({ error: "Invalid credentials" });
  }

  const { passwordHash: _, ...safeUser } = user;
  res.json({ token: signToken(user), user: safeUser });
}
