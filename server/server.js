const app = require("./app");
const { PORT, NODE_ENV } = require("./config/env");
const { startDonorMatchingWorker } = require("./services/donorMatching");
const { startEmailWorker } = require("./services/email");

app.listen(PORT, () => {
  console.log(`HemoConnect API running on port ${PORT} in ${NODE_ENV} mode`);
  startDonorMatchingWorker();
  startEmailWorker();
});