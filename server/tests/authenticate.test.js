jest.mock("../services/prisma", () => ({
  user: {
    findUnique: jest.fn(),
  },
}));

jest.mock("../config/env", () => ({
  JWT_SECRET: "test-secret-for-authentication-middleware",
}));

const jwt = require("jsonwebtoken");
const prisma = require("../services/prisma");
const authenticate = require("../middleware/authenticate");
const { JWT_SECRET } = require("../config/env");

describe("authenticate middleware", () => {
  const createResponse = () => {
    const res = {
      status: jest.fn(),
      json: jest.fn(),
    };
    res.status.mockReturnValue(res);
    res.json.mockReturnValue(res);
    return res;
  };

  const createRequest = (claims = { userId: 7, role: "DONOR" }) => ({
    headers: {
      authorization: `Bearer ${jwt.sign(claims, JWT_SECRET)}`,
    },
  });

  beforeEach(() => {
    prisma.user.findUnique.mockReset();
  });

  it("rejects a token when the account has been deactivated", async () => {
    prisma.user.findUnique.mockResolvedValue({
      role: "DONOR",
      status: "INACTIVE",
      mustChangePassword: false,
    });
    const req = createRequest();
    const res = createResponse();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { userId: 7 },
      select: { role: true, status: true, mustChangePassword: true },
    });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "This account is deactivated.",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a token when its account no longer exists", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const res = createResponse();
    const next = jest.fn();

    await authenticate(createRequest(), res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "The account for this authentication token no longer exists.",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("uses the current database role for role authorization", async () => {
    prisma.user.findUnique.mockResolvedValue({
      role: "ADMIN",
      status: "ACTIVE",
      mustChangePassword: false,
    });
    const req = createRequest({ userId: 7, role: "DONOR" });
    const res = createResponse();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(req.user).toEqual({
      userId: 7,
      role: "ADMIN",
      mustChangePassword: false,
    });
    expect(next).toHaveBeenCalledTimes(1);
  });
});
