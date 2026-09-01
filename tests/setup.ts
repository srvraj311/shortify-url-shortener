// Minimal env so getConfig() doesn't throw in pure-unit tests.
process.env.MONGODB_URI ||= "mongodb://localhost:27017/test";
process.env.MONGODB_DB_NAME ||= "test";
process.env.AUTH_SECRET ||= "test-secret-at-least-16-chars-long";
process.env.PUBLIC_BASE_URL ||= "http://localhost:3000";
process.env.LOG_LEVEL ||= "error";
