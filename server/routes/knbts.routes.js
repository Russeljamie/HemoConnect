const express = require("express");
const { getKnbtsStaffProfile } = require("../controllers/knbtsController");
const authenticate = require("../middleware/authenticate");
const authorize = require("../middleware/authorize");

const router = express.Router();

router.get("/profile", authenticate, authorize("KNBTS_STAFF"), getKnbtsStaffProfile);

module.exports = router;
