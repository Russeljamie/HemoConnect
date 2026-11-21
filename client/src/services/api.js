import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

/*
 * Add the JWT token to requests automatically.
 */
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("hemoconnect_token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/*
 * Handle authentication errors globally.
 */
api.interceptors.response.use(
  (response) => response,

  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("hemoconnect_token");
      localStorage.removeItem("hemoconnect_user");
    }

    return Promise.reject(error);
  }
);

/*
 * Authentication API
 */
export const authAPI = {
  login: async (email, password) => {
    const response = await api.post("/auth/login", {
      email,
      password,
    });

    return response.data;
  },
  changePassword: async (currentPassword, newPassword) => {
    const response = await api.post("/auth/change-password", { currentPassword, newPassword });
    return response.data;
  },
  requestPasswordReset: async (email) => {
    const response = await api.post("/auth/password-reset/request", { email });
    return response.data;
  },
  resetPassword: async (token, newPassword) => {
    const response = await api.post("/auth/password-reset/confirm", { token, newPassword });
    return response.data;
  },

  register: async (userData) => {
    const response = await api.post("/auth/register", userData);

    return response.data;
  },

  getRoleAccess: async () => {
    const response = await api.get("/auth/role-access");

    return response.data;
  },
};

export const ROLE_DASHBOARDS = {
  DONOR: "/dashboard",
  PATIENT: "/patient-dashboard",
  HOSPITAL_STAFF: "/hospital-dashboard",
  NGO: "/ngo-dashboard",
  ADMIN: "/admin-dashboard",
};

export const donorAPI = {
  getProfile: async () => {
    const response = await api.get("/donor/profile");
    return response.data;
  },
  updateProfile: async (profile) => {
    const response = await api.patch("/donor/profile", profile);
    return response.data;
  },
  getDonations: async (params) => {
    const response = await api.get("/donor/donations", { params });
    return response.data;
  },
  getDonation: async (donationId) => {
    const response = await api.get(`/donor/donations/${donationId}`);
    return response.data;
  },
  getAppointments: async () => {
    const response = await api.get("/donor/appointments");
    return response.data;
  },
  getNearbyHospitals: async ({ latitude, longitude }) => {
    const response = await api.get("/donor/appointments/nearby", {
      params: { latitude, longitude },
    });
    return response.data;
  },
  getAppointmentSlots: async (hospitalId) => {
    const response = await api.get("/donor/appointments/slots", { params: { hospitalId } });
    return response.data;
  },
  createAppointment: async (appointment) => {
    const response = await api.post("/donor/appointments", appointment);
    return response.data;
  },
  cancelAppointment: async (appointmentId) => {
    const response = await api.patch(`/donor/appointments/${appointmentId}/cancel`);
    return response.data;
  },
  getAlerts: async () => {
    const response = await api.get("/donor/alerts");
    return response.data;
  },
  respondToAlert: async (requestId, response) => {
    const result = await api.post(`/donor/alerts/${requestId}/respond`, { response });
    return result.data;
  },
  getCampaigns: async () => {
    const response = await api.get("/donor/campaigns");
    return response.data;
  },
  registerForCampaign: async (campaignId) => {
    const response = await api.post(`/donor/campaigns/${campaignId}/register`);
    return response.data;
  },
};

export const patientAPI = {
  getHospitals: async () => {
    const response = await api.get("/patient/hospitals");
    return response.data;
  },
  getProfile: async () => {
    const response = await api.get("/patient/profile");
    return response.data;
  },
  getRequests: async () => {
    const response = await api.get("/patient/requests");
    return response.data;
  },
  getAppointments: async () => {
    const response = await api.get("/patient/appointments");
    return response.data;
  },
  getMedicalNotes: async () => {
    const response = await api.get("/patient/medical-notes");
    return response.data;
  },
  createAssistanceEnquiry: async (enquiryData) => {
    const response = await api.post("/patient/enquiries", enquiryData);
    return response.data;
  },
  markNotificationRead: async (notificationId) => {
    const response = await api.patch(`/patient/notifications/${notificationId}/read`);
    return response.data;
  },
};

export const notificationsAPI = {
  getNotifications: async () => {
    const response = await api.get("/notifications");
    return response.data;
  },
  markNotificationRead: async (notificationId) => {
    const response = await api.patch(`/notifications/${notificationId}/read`);
    return response.data;
  },
  markAllNotificationsRead: async () => {
    const response = await api.patch("/notifications/read-all");
    return response.data;
  },
};

export const hospitalAPI = {
  getProfile: async () => {
    const response = await api.get("/hospital/profile");
    return response.data;
  },
  getInventory: async () => {
    const response = await api.get("/hospital/inventory");
    return response.data;
  },
  getInventoryTransactions: async (filters = {}) => {
    const response = await api.get("/hospital/inventory/transactions", { params: filters });
    return response.data;
  },
  updateInventoryMinimum: async (inventoryId, minimumUnits) => {
    const response = await api.patch(`/hospital/inventory/${inventoryId}/minimum`, { minimumUnits });
    return response.data;
  },
  adjustInventory: async (adjustment) => {
    const response = await api.patch("/hospital/inventory", adjustment);
    return response.data;
  },
  getRequests: async () => {
    const response = await api.get("/hospital/requests");
    return response.data;
  },
  getPatients: async () => {
    const response = await api.get("/hospital/patients");
    return response.data;
  },
  createRequest: async (requestData) => {
    const response = await api.post("/hospital/requests", requestData);
    return response.data;
  },
  getEnquiries: async () => {
    const response = await api.get("/hospital/enquiries");
    return response.data;
  },
  reviewEnquiry: async (enquiryId, decision, reviewNotes) => {
    const response = await api.post(`/hospital/enquiries/${enquiryId}/review`, { decision, reviewNotes });
    return response.data;
  },
  convertEnquiry: async (enquiryId, location) => {
    const response = await api.post(`/hospital/enquiries/${enquiryId}/convert`, location);
    return response.data;
  },
  fulfillRequest: async (requestId, quantity, outcomeNotes) => {
    const response = await api.post(`/hospital/requests/${requestId}/fulfill`, { quantity, outcomeNotes });
    return response.data;
  },
  createPatientAccess: async (patientId, email, relationship) => {
    const response = await api.post(`/hospital/patients/${patientId}/access`, { email, relationship });
    return response.data;
  },
  getDonationNeeds: async () => {
    const response = await api.get("/hospital/donation-needs");
    return response.data;
  },
  createDonationNeed: async (need) => {
    const response = await api.post("/hospital/donation-needs", need);
    return response.data;
  },
  updateDonationNeed: async (needId, status) => {
    const response = await api.patch(`/hospital/donation-needs/${needId}`, { status });
    return response.data;
  },
  updateRequest: async (requestId, status) => {
    const response = await api.patch(`/hospital/requests/${requestId}`, { status });
    return response.data;
  },
  getAppointments: async () => {
    const response = await api.get("/hospital/appointments");
    return response.data;
  },
  getAppointmentSlots: async () => {
    const response = await api.get("/hospital/appointments/slots");
    return response.data;
  },
  createAppointmentSlot: async (slot) => {
    const response = await api.post("/hospital/appointments/slots", slot);
    return response.data;
  },
  updateAppointmentSlot: async (slotId, status) => {
    const response = await api.patch(`/hospital/appointments/slots/${slotId}`, { status });
    return response.data;
  },
  updateAppointmentStatus: async (appointmentId, status) => {
    const response = await api.patch(`/hospital/appointments/${appointmentId}/status`, { status });
    return response.data;
  },
  recordAppointmentDonation: async (appointmentId, donation) => {
    const response = await api.post(`/hospital/appointments/${appointmentId}/donation`, donation);
    return response.data;
  },
  getStaff: async () => {
    const response = await api.get("/hospital/staff");
    return response.data;
  },
};

export const ngoAPI = {
  getProfile: async () => {
    const response = await api.get("/ngo/profile");
    return response.data;
  },
  getCampaigns: async () => {
    const response = await api.get("/ngo/campaigns");
    return response.data;
  },
  getDonationNeeds: async () => {
    const response = await api.get("/ngo/donation-needs");
    return response.data;
  },
  createCampaign: async (campaign) => {
    const response = await api.post("/ngo/campaigns", campaign);
    return response.data;
  },
  updateCampaign: async (campaignId, updates) => {
    const response = await api.patch(`/ngo/campaigns/${campaignId}`, updates);
    return response.data;
  },
  getOutreachActivities: async () => {
    const response = await api.get("/ngo/outreach");
    return response.data;
  },
  createOutreachActivity: async (activity) => {
    const response = await api.post("/ngo/outreach", activity);
    return response.data;
  },
  updateOutreachActivity: async (activityId, updates) => {
    const response = await api.patch(`/ngo/outreach/${activityId}`, updates);
    return response.data;
  },
  getNotifications: async () => {
    const response = await api.get("/ngo/notifications");
    return response.data;
  },
  markNotificationRead: async (notificationId) => {
    const response = await api.patch(`/ngo/notifications/${notificationId}/read`);
    return response.data;
  },
  markAllNotificationsRead: async () => {
    const response = await api.patch("/ngo/notifications/read-all");
    return response.data;
  },
  getReports: async (params) => {
    const response = await api.get("/ngo/reports", { params });
    return response.data;
  },
};

export const adminAPI = {
  getDashboardSummary: async () => {
    const response = await api.get("/admin/dashboard");
    return response.data;
  },
  getUsers: async (params) => {
    const response = await api.get("/admin/users", { params });
    return response.data;
  },
  updateUserStatus: async (userId, status) => {
    const response = await api.patch(`/admin/users/${userId}/status`, { status });
    return response.data;
  },
  createHospitalStaff: async (staffData) => {
    const response = await api.post("/admin/hospital-staff", staffData);
    return response.data;
  },
  getHospitals: async (params) => {
    const response = await api.get("/admin/hospitals", { params });
    return response.data;
  },
  createHospital: async (hospitalData) => {
    const response = await api.post("/admin/hospitals", hospitalData);
    return response.data;
  },
  updateHospitalStatus: async (hospitalId, status) => {
    const response = await api.patch(`/admin/hospitals/${hospitalId}/status`, { status });
    return response.data;
  },
  getInventory: async (params) => {
    const response = await api.get("/admin/inventory", { params });
    return response.data;
  },
};

export const getDashboardPath = (role) => {
  return ROLE_DASHBOARDS[role] || "/dashboard";
};

/*
 * Save authenticated user information.
 */
export const saveAuthData = (authData) => {
  if (authData?.data?.token) {
    localStorage.setItem(
      "hemoconnect_token",
      authData.data.token
    );
  }

  if (authData?.data?.user) {
    localStorage.setItem(
      "hemoconnect_user",
      JSON.stringify(authData.data.user)
    );
  }
};

/*
 * Get the stored JWT token.
 */
export const getToken = () => {
  return localStorage.getItem("hemoconnect_token");
};

/*
 * Get the stored logged-in user.
 */
export const getCurrentUser = () => {
  const user = localStorage.getItem("hemoconnect_user");

  if (!user) {
    return null;
  }

  try {
    return JSON.parse(user);
  } catch {
    return null;
  }
};

/*
 * Check whether a user is currently logged in.
 */
export const isAuthenticated = () => {
  return Boolean(getToken());
};

/*
 * Log the user out.
 */
export const logout = () => {
  localStorage.removeItem("hemoconnect_token");
  localStorage.removeItem("hemoconnect_user");
};

export default api;
