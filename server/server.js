const app = require("./app");
const { PORT, NODE_ENV } = require("./config/env");

app.listen(PORT, () => {
  console.log(`HemoConnect API running on port ${PORT} in ${NODE_ENV} mode`);
});