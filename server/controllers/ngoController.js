const prisma = require("../services/prisma");

const getNgoUser = async (userId) => prisma.nGOUser.findUnique({
  where: { userId },
  include: {
    ngo: {
      include: {
        hospitals: {
          where: { isActive: true },
          select: { hospitalId: true, name: true, location: true },
        },
      },
    },
  },
});

const campaignRelations = {
  hospital: { select: { hospitalId: true, name: true, location: true } },
  hospitalNeed: {
    select: { needId: true, bloodType: true, unitsNeeded: true, neededBy: true, status: true },
  },
  _count: { select: { donorRegistrations: true } },
};

const getNgoProfile = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { userId: req.user.userId },
      include: {
        ngoUser: {
          include: {
            ngo: {
              include: {
                campaigns: {
                  orderBy: { startDate: "asc" },
                  take: 6,
                  include: {
                    hospital: true,
                  },
                },
                hospitals: true,
                users: {
                  include: {
                    user: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "NGO profile not found.",
      });
    }

    if (!user.ngoUser) {
      return res.status(404).json({
        success: false,
        message: "This user does not have an NGO profile.",
      });
    }

    const ngo = user.ngoUser.ngo;
    const campaigns = (ngo.campaigns || []).map((campaign) => ({
      title: campaign.name,
      meta: campaign.hospital?.name || "Community outreach",
      sub: `${new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(campaign.startDate))} • ${campaign.status}`,
      status: campaign.status,
    }));

    const metrics = {
      campaigns: ngo.campaigns.length,
      volunteers: ngo.users.length,
      partnerHospitals: ngo.hospitals.length,
      activeCampaigns: ngo.campaigns.filter((campaign) =>
        ["PLANNED", "ACTIVE", "OPEN"].includes(campaign.status)
      ).length,
    };

    return res.status(200).json({
      success: true,
      message: "NGO profile retrieved successfully",
      data: {
        user: {
          userId: user.userId,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          role: user.role,
          ngoName: ngo.name,
          location: ngo.location,
          contactInfo: ngo.contactInfo,
        },
        metrics,
        campaigns,
      },
    });
  } catch (error) {
    next(error);
  }
};

const listNgoCampaigns = async (req, res, next) => {
  try {
    const ngoUser = await getNgoUser(req.user.userId);
    if (!ngoUser) {
      return res.status(404).json({ success: false, message: "NGO profile not found." });
    }

    const campaigns = await prisma.campaign.findMany({
      where: { ngoId: ngoUser.ngoId },
      include: campaignRelations,
      orderBy: [{ startDate: "asc" }, { campaignId: "asc" }],
    });

    return res.status(200).json({
      success: true,
      data: { campaigns, hospitals: ngoUser.ngo.hospitals },
    });
  } catch (error) {
    next(error);
  }
};

const listNgoHospitalNeeds = async (req, res, next) => {
  try {
    const ngoUser = await getNgoUser(req.user.userId);
    if (!ngoUser) return res.status(404).json({ success: false, message: "NGO profile not found." });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const needs = await prisma.hospitalDonationNeed.findMany({
      where: {
        status: "OPEN",
        neededBy: { gte: today },
        hospital: {
          isActive: true,
          ngos: { some: { ngoId: ngoUser.ngoId, isActive: true } },
        },
      },
      include: { hospital: { select: { hospitalId: true, name: true, location: true } } },
      orderBy: [{ neededBy: "asc" }, { createdAt: "desc" }],
    });
    return res.status(200).json({ success: true, data: { needs } });
  } catch (error) {
    next(error);
  }
};

const getPartnerHospitalNeed = async (ngoUser, hospitalNeedId) => {
  if (!hospitalNeedId) return null;
  return prisma.hospitalDonationNeed.findFirst({
    where: {
      needId: hospitalNeedId,
      status: "OPEN",
      hospital: {
        isActive: true,
        ngos: { some: { ngoId: ngoUser.ngoId, isActive: true } },
      },
    },
    select: { needId: true, hospitalId: true, bloodType: true },
  });
};

const createNgoCampaign = async (req, res, next) => {
  try {
    const ngoUser = await getNgoUser(req.user.userId);
    if (!ngoUser) {
      return res.status(404).json({ success: false, message: "NGO profile not found." });
    }

    const { name, description, startDate, endDate, location, hospitalId, hospitalNeedId } = req.body;
    if (new Date(endDate) < new Date(startDate)) {
      return res.status(400).json({ success: false, message: "End date must be on or after the start date." });
    }

    const hospital = hospitalId
      ? ngoUser.ngo.hospitals.find((item) => item.hospitalId === hospitalId)
      : null;
    if (hospitalId && !hospital) {
      return res.status(400).json({ success: false, message: "Select one of your NGO's active partner hospitals." });
    }
    const need = hospitalNeedId ? await getPartnerHospitalNeed(ngoUser, hospitalNeedId) : null;
    if (hospitalNeedId && !need) {
      return res.status(400).json({ success: false, message: "Select an open need from an active partner hospital." });
    }
    if (need && hospital && need.hospitalId !== hospital.hospitalId) {
      return res.status(400).json({ success: false, message: "The selected donation need belongs to a different hospital." });
    }

    const campaign = await prisma.$transaction(async (tx) => {
      const createdCampaign = await tx.campaign.create({
        data: {
          name,
          description,
          startDate,
          endDate,
          location,
          status: "PLANNED",
          ngoId: ngoUser.ngoId,
          createdByNgoUserId: ngoUser.ngoUserId,
          hospitalId: need?.hospitalId || hospital?.hospitalId || null,
          hospitalNeedId: need?.needId || null,
        },
        include: campaignRelations,
      });
      const donors = await tx.donor.findMany({
        where: {
          user: { status: "ACTIVE" },
          ...(need ? { bloodType: need.bloodType } : {}),
        },
        select: { userId: true },
      });
      if (donors.length) {
        await tx.notification.createMany({
          data: donors.map(({ userId }) => ({
            type: "CAMPAIGN_ANNOUNCEMENT",
            channel: "IN_APP",
            title: need ? `${need.bloodType} blood donation campaign` : "New blood donation campaign",
            message: `${name} is scheduled for ${new Date(startDate).toLocaleDateString()} at ${location}.${need ? ` Donors with blood type ${need.bloodType} are invited.` : ""}`,
            status: "SENT",
            sentAt: new Date(),
            userId,
            campaignId: createdCampaign.campaignId,
          })),
        });
      }
      return createdCampaign;
    });

    return res.status(201).json({
      success: true,
      message: "Campaign created.",
      data: { campaign },
    });
  } catch (error) {
    next(error);
  }
};

const updateNgoCampaign = async (req, res, next) => {
  try {
    const ngoUser = await getNgoUser(req.user.userId);
    if (!ngoUser) {
      return res.status(404).json({ success: false, message: "NGO profile not found." });
    }

    const campaignId = Number(req.params.campaignId);
    const campaign = await prisma.campaign.findFirst({
      where: { campaignId, ngoId: ngoUser.ngoId },
    });
    if (!campaign) {
      return res.status(404).json({ success: false, message: "Campaign not found." });
    }

    const statusTransitions = {
      PLANNED: ["ACTIVE", "CANCELLED"],
      ACTIVE: ["COMPLETED", "CANCELLED"],
    };
    if (req.body.status && !statusTransitions[campaign.status]?.includes(req.body.status)) {
      return res.status(409).json({
        success: false,
        message: `Cannot change a ${campaign.status} campaign to ${req.body.status}.`,
      });
    }

    const data = {};
    for (const field of ["name", "description", "startDate", "endDate", "location"]) {
      if (req.body[field] !== undefined) data[field] = req.body[field];
    }
    if (req.body.status !== undefined) data.status = req.body.status;

    if (req.body.hospitalId !== undefined) {
      const hospitalId = req.body.hospitalId || null;
      const hospital = hospitalId
        ? ngoUser.ngo.hospitals.find((item) => item.hospitalId === hospitalId)
        : null;
      if (hospitalId && !hospital) {
        return res.status(400).json({ success: false, message: "Select one of your NGO's active partner hospitals." });
      }
      data.hospitalId = hospital?.hospitalId || null;
    }
    if (req.body.hospitalNeedId !== undefined) {
      const hospitalNeedId = req.body.hospitalNeedId || null;
      const needUnchanged = hospitalNeedId === campaign.hospitalNeedId;
      const need = hospitalNeedId && !needUnchanged
        ? await getPartnerHospitalNeed(ngoUser, hospitalNeedId)
        : null;
      if (hospitalNeedId && !needUnchanged && !need) {
        return res.status(400).json({ success: false, message: "Select an open need from an active partner hospital." });
      }
      const targetHospitalId = data.hospitalId !== undefined ? data.hospitalId : campaign.hospitalId;
      if (need && targetHospitalId && need.hospitalId !== targetHospitalId) {
        return res.status(400).json({ success: false, message: "The selected donation need belongs to a different hospital." });
      }
      data.hospitalNeedId = need?.needId || (
        needUnchanged && (data.hospitalId === undefined || data.hospitalId === campaign.hospitalId)
          ? campaign.hospitalNeedId
          : null
      );
      if (need && data.hospitalId === undefined) data.hospitalId = need.hospitalId;
    }
    if (req.body.hospitalId !== undefined && req.body.hospitalNeedId === undefined && campaign.hospitalNeedId) {
      const existingNeed = await prisma.hospitalDonationNeed.findUnique({
        where: { needId: campaign.hospitalNeedId },
        select: { hospitalId: true },
      });
      if (existingNeed && existingNeed.hospitalId !== data.hospitalId) data.hospitalNeedId = null;
    }

    const startDate = data.startDate || campaign.startDate;
    const endDate = data.endDate || campaign.endDate;
    if (new Date(endDate) < new Date(startDate)) {
      return res.status(400).json({ success: false, message: "End date must be on or after the start date." });
    }
    if (!Object.keys(data).length) {
      return res.status(400).json({ success: false, message: "Provide at least one campaign change." });
    }

    const updated = await prisma.campaign.updateMany({
      where: { campaignId, ngoId: ngoUser.ngoId, status: campaign.status },
      data,
    });
    if (!updated.count) {
      return res.status(409).json({ success: false, message: "Campaign changed. Refresh and retry." });
    }

    const updatedCampaign = await prisma.campaign.findUnique({
      where: { campaignId },
      include: campaignRelations,
    });
    return res.status(200).json({
      success: true,
      message: "Campaign updated.",
      data: { campaign: updatedCampaign },
    });
  } catch (error) {
    next(error);
  }
};

const outreachRelations = {
  campaign: { select: { campaignId: true, name: true } },
  createdByNgoUser: {
    select: { user: { select: { firstName: true, lastName: true } } },
  },
};

const listNgoOutreachActivities = async (req, res, next) => {
  try {
    const ngoUser = await getNgoUser(req.user.userId);
    if (!ngoUser) {
      return res.status(404).json({ success: false, message: "NGO profile not found." });
    }

    const [activities, campaigns] = await Promise.all([
      prisma.outreachActivity.findMany({
        where: { ngoId: ngoUser.ngoId },
        include: outreachRelations,
        orderBy: [{ scheduledAt: "desc" }, { activityId: "desc" }],
      }),
      prisma.campaign.findMany({
        where: { ngoId: ngoUser.ngoId, status: { in: ["PLANNED", "ACTIVE"] } },
        select: { campaignId: true, name: true },
        orderBy: { startDate: "asc" },
      }),
    ]);

    return res.status(200).json({ success: true, data: { activities, campaigns } });
  } catch (error) {
    next(error);
  }
};

const createNgoOutreachActivity = async (req, res, next) => {
  try {
    const ngoUser = await getNgoUser(req.user.userId);
    if (!ngoUser) {
      return res.status(404).json({ success: false, message: "NGO profile not found." });
    }

    const { title, activityType, description, location, scheduledAt, campaignId } = req.body;
    if (campaignId) {
      const campaign = await prisma.campaign.findFirst({
        where: { campaignId, ngoId: ngoUser.ngoId },
        select: { campaignId: true },
      });
      if (!campaign) {
        return res.status(400).json({ success: false, message: "Select one of your NGO's campaigns." });
      }
    }

    const activity = await prisma.outreachActivity.create({
      data: {
        title,
        activityType,
        description,
        location,
        scheduledAt,
        ngoId: ngoUser.ngoId,
        campaignId: campaignId || null,
        createdByNgoUserId: ngoUser.ngoUserId,
      },
      include: outreachRelations,
    });

    return res.status(201).json({
      success: true,
      message: "Outreach activity created.",
      data: { activity },
    });
  } catch (error) {
    next(error);
  }
};

const updateNgoOutreachActivity = async (req, res, next) => {
  try {
    const ngoUser = await getNgoUser(req.user.userId);
    if (!ngoUser) {
      return res.status(404).json({ success: false, message: "NGO profile not found." });
    }

    const activityId = Number(req.params.activityId);
    const activity = await prisma.outreachActivity.findFirst({
      where: { activityId, ngoId: ngoUser.ngoId },
    });
    if (!activity) {
      return res.status(404).json({ success: false, message: "Outreach activity not found." });
    }

    const transitions = {
      PLANNED: ["IN_PROGRESS", "CANCELLED"],
      IN_PROGRESS: ["COMPLETED", "CANCELLED"],
    };
    if (req.body.status && !transitions[activity.status]?.includes(req.body.status)) {
      return res.status(409).json({
        success: false,
        message: `Cannot change an activity from ${activity.status} to ${req.body.status}.`,
      });
    }

    const data = {};
    for (const field of ["title", "activityType", "description", "location", "scheduledAt", "peopleReached", "status"]) {
      if (req.body[field] !== undefined) data[field] = req.body[field];
    }
    if (req.body.campaignId !== undefined) {
      const campaignId = req.body.campaignId || null;
      if (campaignId) {
        const campaign = await prisma.campaign.findFirst({
          where: { campaignId, ngoId: ngoUser.ngoId },
          select: { campaignId: true },
        });
        if (!campaign) {
          return res.status(400).json({ success: false, message: "Select one of your NGO's campaigns." });
        }
      }
      data.campaignId = campaignId;
    }
    if (!Object.keys(data).length) {
      return res.status(400).json({ success: false, message: "Provide at least one activity change." });
    }

    const updated = await prisma.outreachActivity.updateMany({
      where: { activityId, ngoId: ngoUser.ngoId, status: activity.status },
      data,
    });
    if (!updated.count) {
      return res.status(409).json({ success: false, message: "Activity changed. Refresh and retry." });
    }

    const updatedActivity = await prisma.outreachActivity.findUnique({
      where: { activityId },
      include: outreachRelations,
    });
    return res.status(200).json({
      success: true,
      message: "Outreach activity updated.",
      data: { activity: updatedActivity },
    });
  } catch (error) {
    next(error);
  }
};

const listNgoNotifications = async (req, res, next) => {
  try {
    const ngoUser = await getNgoUser(req.user.userId);
    if (!ngoUser) {
      return res.status(404).json({ success: false, message: "NGO profile not found." });
    }

    const where = { userId: req.user.userId };
    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        include: { campaign: { select: { campaignId: true, name: true } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.notification.count({ where: { ...where, readAt: null } }),
    ]);

    return res.status(200).json({ success: true, data: { notifications, unreadCount } });
  } catch (error) {
    next(error);
  }
};

const markNgoNotificationRead = async (req, res, next) => {
  try {
    const notificationId = Number(req.params.notificationId);
    const notification = await prisma.notification.findFirst({
      where: { notificationId, userId: req.user.userId },
      select: { notificationId: true, readAt: true },
    });
    if (!notification) {
      return res.status(404).json({ success: false, message: "Notification not found." });
    }

    const readAt = notification.readAt || new Date();
    await prisma.notification.updateMany({
      where: { notificationId, userId: req.user.userId, readAt: null },
      data: { readAt },
    });
    return res.status(200).json({ success: true, message: "Notification marked as read." });
  } catch (error) {
    next(error);
  }
};

const markAllNgoNotificationsRead = async (req, res, next) => {
  try {
    const result = await prisma.notification.updateMany({
      where: { userId: req.user.userId, readAt: null },
      data: { readAt: new Date() },
    });
    return res.status(200).json({
      success: true,
      message: "Notifications marked as read.",
      data: { updatedCount: result.count },
    });
  } catch (error) {
    next(error);
  }
};

const getNgoReports = async (req, res, next) => {
  try {
    const ngoUser = await getNgoUser(req.user.userId);
    if (!ngoUser) {
      return res.status(404).json({ success: false, message: "NGO profile not found." });
    }

    const from = req.query.from ? new Date(req.query.from) : null;
    const to = req.query.to ? new Date(req.query.to) : null;
    if (from) from.setHours(0, 0, 0, 0);
    if (to) to.setHours(23, 59, 59, 999);
    if (from && to && from > to) {
      return res.status(400).json({ success: false, message: "Start date must be on or before end date." });
    }

    const dateRange = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    };
    const campaignDateFilter = Object.keys(dateRange).length ? { startDate: dateRange } : {};
    const registrationDateFilter = Object.keys(dateRange).length ? { registeredAt: dateRange } : {};
    const outreachDateFilter = Object.keys(dateRange).length ? { scheduledAt: dateRange } : {};

    const [campaigns, registrationsByCampaign, outreachByCampaign, outreachByType] = await Promise.all([
      prisma.campaign.findMany({
        where: { ngoId: ngoUser.ngoId, ...campaignDateFilter },
        select: { campaignId: true, name: true, status: true, startDate: true, endDate: true, location: true },
        orderBy: [{ startDate: "asc" }, { campaignId: "asc" }],
      }),
      prisma.campaignRegistration.groupBy({
        by: ["campaignId"],
        where: { campaign: { ngoId: ngoUser.ngoId }, ...registrationDateFilter },
        _count: { _all: true },
      }),
      prisma.outreachActivity.groupBy({
        by: ["campaignId"],
        where: { ngoId: ngoUser.ngoId, ...outreachDateFilter },
        _count: { _all: true },
        _sum: { peopleReached: true },
      }),
      prisma.outreachActivity.groupBy({
        by: ["activityType"],
        where: { ngoId: ngoUser.ngoId, ...outreachDateFilter },
        _count: { _all: true },
        _sum: { peopleReached: true },
      }),
    ]);

    const registrations = new Map(registrationsByCampaign.map((item) => [item.campaignId, item._count._all]));
    const outreach = new Map(outreachByCampaign.map((item) => [item.campaignId, item]));
    const campaignReports = campaigns.map((campaign) => {
      const activityGroup = outreach.get(campaign.campaignId);
      return {
        ...campaign,
        registeredDonors: registrations.get(campaign.campaignId) || 0,
        outreachActivities: activityGroup?._count._all || 0,
        peopleReached: activityGroup?._sum.peopleReached || 0,
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        period: { from, to },
        metrics: {
          campaigns: campaigns.length,
          activeCampaigns: campaigns.filter((campaign) => campaign.status === "ACTIVE").length,
          registeredDonors: registrationsByCampaign.reduce((total, item) => total + item._count._all, 0),
          outreachActivities: outreachByCampaign.reduce((total, item) => total + item._count._all, 0),
          peopleReached: outreachByCampaign.reduce((total, item) => total + (item._sum.peopleReached || 0), 0),
        },
        campaigns: campaignReports,
        activityTypes: outreachByType.map((item) => ({
          activityType: item.activityType,
          activities: item._count._all,
          peopleReached: item._sum.peopleReached || 0,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getNgoProfile,
  listNgoCampaigns,
  listNgoHospitalNeeds,
  createNgoCampaign,
  updateNgoCampaign,
  listNgoOutreachActivities,
  createNgoOutreachActivity,
  updateNgoOutreachActivity,
  listNgoNotifications,
  markNgoNotificationRead,
  markAllNgoNotificationsRead,
  getNgoReports,
};
