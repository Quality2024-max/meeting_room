-- Run once on an EXISTING database (new installs already get this from database.sql)
USE interview_meeting_app;

ALTER TABLE chat_messages
  MODIFY user_id INT NULL,
  ADD COLUMN guest_name VARCHAR(100) NULL AFTER user_id;
