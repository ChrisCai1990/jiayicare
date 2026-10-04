const crypto = require('crypto');

const jobs = new Map();
const RESULT_TTL_MS = 30 * 60 * 1000;

function createReportUploadJob(ownerId, file, upload) {
  const id = crypto.randomUUID();
  const job = { ownerId: String(ownerId), state: 'processing', createdAt: Date.now() };
  jobs.set(id, job);
  // Finish the HTTP request before waiting for a slow OSS write. Keep the
  // Buffer alive only while this upload is running.
  setImmediate(async () => {
    try {
      job.result = await upload(file.buffer, file.mimetype);
      job.state = 'done';
    } catch (error) {
      job.state = 'failed';
      console.error('[staff-report-upload] failed', {
        staffId: job.ownerId,
        fileSize: file.size,
        durationMs: Date.now() - job.createdAt,
        message: error.message,
      });
    } finally {
      setTimeout(() => jobs.delete(id), RESULT_TTL_MS).unref();
    }
  });
  return id;
}

function getReportUploadJob(id, ownerId) {
  const job = jobs.get(id);
  if (!job || job.ownerId !== String(ownerId)) return null;
  return job.state === 'done' ? { state: 'done', result: job.result } : { state: job.state };
}

module.exports = { createReportUploadJob, getReportUploadJob };
