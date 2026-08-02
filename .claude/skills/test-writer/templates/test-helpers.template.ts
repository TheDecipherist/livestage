// Shared test helpers. Import these from every route test. Do NOT re-inline the
// DB mock, token generation, env setup, or request builders below into each test
// file. That duplication is the exact anti-pattern this file removes: in real
// audited projects a helper like this already existed and the tests STILL
// hand-rolled the same vi.mock block, the same JWT env lines, and the same token
// setup in every file. If this module exists in a project, import it. If it does
// not, create it once from this scaffold, then import it everywhere.
//
// Adapt the PROJECT: slots to the real project (module paths, envelope shape,
// role enum, JWT signer). Everything below the slots is stable across features.

import { vi, expect } from 'vitest'
// PROJECT: real id type and role enum
// import { ObjectId } from 'mongodb'
// import { UserRole } from '@/core/types/common.js'
// PROJECT: real token signer
// import { signAccessToken } from '@/server/auth/jwt.js'

// PROJECT: the secret env names the app actually reads
process.env.JWT_ACCESS_SECRET = 'test-access-secret'
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret'

// Standard data-adapter mock. One factory for every route test, so a change to
// the adapter surface is one edit here, not N test files.
// PROJECT: match the method names to the real data adapter (StrictDB / native).
export function createDbMock() {
  return {
    queryOne: vi.fn().mockResolvedValue(null),
    queryMany: vi.fn().mockResolvedValue([]),
    insertOne: vi.fn().mockResolvedValue(undefined),
    updateOne: vi.fn().mockResolvedValue({ matchedCount: 1, modifiedCount: 1 }),
    deleteOne: vi.fn().mockResolvedValue({ deletedCount: 1 }),
    deleteMany: vi.fn().mockResolvedValue(undefined),
    count: vi.fn().mockResolvedValue(0),
  }
}

// Auth header for a given role. Seeds a REAL id type, never a string id, so the
// string-vs-ObjectId _id mismatch bug cannot hide behind the fixture.
// PROJECT: wire to the real signer and role enum.
export function authHeader(/* role = UserRole.Operator, companyId?: string */): string {
  // const token = signAccessToken({
  //   sub: new ObjectId().toString(),
  //   company_id: companyId ?? new ObjectId().toString(),
  //   role,
  //   email: `${role}@test.com`,
  // })
  // return `Bearer ${token}`
  return 'Bearer PROJECT_FILL_TOKEN'
}

// Assert the project's canonical response envelope in one place. If the envelope
// shape changes, it changes here, not in every test.
// PROJECT: match the real envelope (the { success, data, error } shape shown).
export function expectOk(res: { status: number; body: any }, status = 200) {
  expect(res.status).toBe(status)
  expect(res.body.success).toBe(true)
  return res.body.data
}
export function expectError(res: { status: number; body: any }, status: number) {
  expect(res.status).toBe(status)
  expect(res.body.success).toBe(false)
  return res.body.error
}
