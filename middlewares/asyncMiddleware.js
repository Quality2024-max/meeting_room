// Express 4 does not catch errors thrown in async handlers - this forwards them to the error handler.

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export default wrap;