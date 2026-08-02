// API route test scaffold. Start here, fill the FEATURE slots, delete cases that
// do not apply. The authorization and validation blocks are the standard tiers
// that repeat across every protected endpoint: import them from the shared
// helpers, do not re-derive them. The FEATURE block is where the real,
// bug-catching assertions go, and that part is NEVER templated.

import { describe, it, beforeEach, vi } from 'vitest'
import request from 'supertest'
// Import the shared helpers. Never re-inline createDbMock / authHeader / env.
import { createDbMock, authHeader, expectOk, expectError } from './helpers.js'
// PROJECT: import createApp and mock the modules this route calls
// import { createApp } from '@/server/app.js'
// vi.mock('@/core/db/index.js', () => createDbMock())

// const app = createApp()

describe('METHOD /api/v1/FEATURE', () => {
  beforeEach(() => { vi.clearAllMocks() })

  // --- Standard tier: authorization (include for every protected route) ---
  it('returns 401 without a token', async () => {
    // const res = await request(app).get('/api/v1/FEATURE')
    // expectError(res, 401)
  })

  it('returns 403 for a role that lacks permission', async () => {
    // const res = await request(app)
    //   .post('/api/v1/FEATURE')
    //   .set('Authorization', authHeader(/* a role without access */))
    // expectError(res, 403)
  })

  // --- Standard tier: input validation (one per required field or rule) ---
  it('returns 400 when REQUIRED_FIELD is missing', async () => {
    // const res = await request(app)
    //   .post('/api/v1/FEATURE')
    //   .set('Authorization', authHeader())
    //   .send({ /* omit REQUIRED_FIELD */ })
    // expect(expectError(res, 400)).toContain('REQUIRED_FIELD')
  })

  // --- FEATURE tier: the real behavior. NOT templated, write from the doc. ---
  // For each documented behavior: the happy path asserting the EXACT response
  // shape and status from the doc, plus each documented error case. Assert
  // specific values and specific side-effect calls, never toBeDefined. This is
  // the part that catches the feature's actual bugs.
  it('does THE DOCUMENTED THING and returns THE EXACT SHAPE', async () => {
    // Arrange: mock the service to return the documented value
    // Act: real request through the app
    // Assert: exact status, exact body fields, exact mock call args
  })
})
