-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "Learner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
