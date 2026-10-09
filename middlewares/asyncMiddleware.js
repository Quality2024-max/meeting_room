// This middleware function is used to wrap asynchronous route handlers in Express.js. It ensures that any errors thrown in the async function are properly caught and passed to the next middleware (usually an error handler).

const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export default wrap;
