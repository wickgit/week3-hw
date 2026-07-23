import jwt from 'jsonwebtoken';

function secret() {
  const value = process.env.JWT_SECRET;
  if (!value) {
    throw new Error('JWT_SECRET is not set');
  }
  return value;
}

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    secret(),
    { expiresIn: process.env.JWT_EXPIRES_IN || '1d' },
  );
}

export function verifyToken(token) {
  return jwt.verify(token, secret());
}
