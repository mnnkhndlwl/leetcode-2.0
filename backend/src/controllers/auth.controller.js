import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq, or } from "drizzle-orm";
import { hashPassword, comparePassword } from "../utils/hash.js";
import { signToken } from "../utils/jwt.js";
import { HTTP } from "../constants/http.js";

export async function signup(req, res) {
  const { username, email, password } = req.body;

  const [existing] = await db
    .select({ id: users.id, email: users.email, username: users.username })
    .from(users)
    .where(or(eq(users.email, email), eq(users.username, username)))
    .limit(1);

  if (existing) {
    const field = existing.email === email ? "email" : "username";
    return res.status(HTTP.CONFLICT).json({
      error: `${field} is already in use`,
      fieldErrors: { [field]: `${field} is already in use` },
    });
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

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user || user.isDeleted) {
    return res
      .status(HTTP.UNAUTHORIZED)
      .json({ error: "Invalid email or password" });
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    return res
      .status(HTTP.UNAUTHORIZED)
      .json({ error: "Invalid email or password" });
  }

  const { passwordHash: _, ...safeUser } = user;
  res.json({ token: signToken(user), user: safeUser });
}
