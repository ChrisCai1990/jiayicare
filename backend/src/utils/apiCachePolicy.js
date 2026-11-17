// Authenticated API responses must not be satisfied from a stale client cache.
// WeChat's request stack can revalidate JSON responses and receive 304 with
// no body, which the mini program cannot use as a fresh API result.
function configureApiCachePolicy(app) {
  app.disable('etag');
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
}

module.exports = { configureApiCachePolicy };
