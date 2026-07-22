import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('Jobs API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/jobs creates a job and returns 201 with jobId', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/jobs')
      .send({ urls: ['https://example.com'] })
      .expect(201);
    expect(res.body.jobId).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('POST /api/jobs returns 400 on invalid urls', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/jobs')
      .send({ urls: ['not-a-url'] })
      .expect(400);
    expect(res.body.details).toBeDefined();
  });

  it('POST /api/jobs returns 400 on empty urls array', async () => {
    await request(app.getHttpServer())
      .post('/api/jobs')
      .send({ urls: [] })
      .expect(400);
  });

  it('GET /api/jobs lists jobs with pagination', async () => {
    await request(app.getHttpServer())
      .post('/api/jobs')
      .send({ urls: ['https://a.example'] })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/api/jobs')
      .query({ page: 1, limit: 5, sortBy: 'createdAt', sortOrder: 'desc' })
      .expect(200);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 5 });
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('GET /api/jobs/:id returns details or 404', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/jobs')
      .send({ urls: ['https://b.example'] })
      .expect(201);
    const id: string = created.body.jobId;

    const res = await request(app.getHttpServer())
      .get(`/api/jobs/${id}`)
      .expect(200);
    expect(res.body.id).toBe(id);
    expect(Array.isArray(res.body.items)).toBe(true);

    const missing = await request(app.getHttpServer())
      .get('/api/jobs/00000000-0000-4000-8000-000000000000')
      .expect(404);
    expect(missing.body).toBeDefined();
  });

  it('GET /api/jobs/:id with a malformed id returns 400', async () => {
    await request(app.getHttpServer())
      .get('/api/jobs/not-a-uuid')
      .expect(400);
  });

  it('DELETE /api/jobs/:id cancels an active job', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/jobs')
      .send({ urls: ['https://c.example'] })
      .expect(201);
    const id: string = created.body.jobId;

    const res = await request(app.getHttpServer())
      .delete(`/api/jobs/${id}`)
      .expect(200);
    expect(['cancelled', 'completed', 'failed']).toContain(res.body.status);
  });

  it('DELETE /api/jobs/:id returns 404 for unknown id', async () => {
    await request(app.getHttpServer())
      .delete('/api/jobs/00000000-0000-4000-8000-000000000000')
      .expect(404);
  });
});
