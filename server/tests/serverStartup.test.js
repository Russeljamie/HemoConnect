describe("server startup", () => {
  it("does not start the HTTP server or background workers when imported by tests", () => {
    const listen = jest.fn();
    const startDonorMatchingWorker = jest.fn();
    const startEmailWorker = jest.fn();
    const startSmsWorker = jest.fn();
    const startAppointmentReminderWorker = jest.fn();

    jest.isolateModules(() => {
      jest.doMock("../app", () => ({ listen }));
      jest.doMock("../config/env", () => ({ PORT: 3000, NODE_ENV: "test" }));
      jest.doMock("../services/donorMatching", () => ({ startDonorMatchingWorker }));
      jest.doMock("../services/email", () => ({ startEmailWorker }));
      jest.doMock("../services/sms", () => ({ startSmsWorker }));
      jest.doMock("../services/appointmentReminders", () => ({ startAppointmentReminderWorker }));

      const { startServer } = require("../server");
      expect(startServer).toEqual(expect.any(Function));
    });

    expect(listen).not.toHaveBeenCalled();
    expect(startDonorMatchingWorker).not.toHaveBeenCalled();
    expect(startEmailWorker).not.toHaveBeenCalled();
    expect(startSmsWorker).not.toHaveBeenCalled();
    expect(startAppointmentReminderWorker).not.toHaveBeenCalled();
  });
});
