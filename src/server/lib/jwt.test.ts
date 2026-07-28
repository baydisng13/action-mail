import { describe, expect, it } from "vitest";
import { type AccessClaims, signAccessToken, verifyAccessToken } from "./jwt";

const claims: AccessClaims = {
	sub: "user_123",
	activeTeamId: "team_123",
	role: "owner",
	plan: "free",
};

describe("access token", () => {
	it("round-trips claims through sign/verify", async () => {
		const token = await signAccessToken(claims);
		const decoded = await verifyAccessToken(token);
		expect(decoded).toMatchObject(claims);
	});

	it("rejects a tampered token", async () => {
		const token = await signAccessToken(claims);
		const tampered = `${token.slice(0, -3)}abc`;
		expect(await verifyAccessToken(tampered)).toBeNull();
	});

	it("rejects garbage", async () => {
		expect(await verifyAccessToken("not.a.jwt")).toBeNull();
	});
});
