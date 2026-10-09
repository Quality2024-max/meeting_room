CREATE DATABASE IF NOT EXISTS interview_meeting_app;

USE interview_meeting_app;

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS meetings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_code VARCHAR(12) NOT NULL UNIQUE,
    title VARCHAR(150) NOT NULL,
    type ENUM('interview','meeting') NOT NULL DEFAULT 'meeting',
    host_id INT NOT NULL,
    candidate_name VARCHAR(100) NULL,
    scheduled_at DATETIME NOT NULL,
    duration_min INT NOT NULL DEFAULT 30,
    status ENUM('scheduled','live','ended') NOT NULL DEFAULT 'scheduled',
    rating TINYINT NULL,
    feedback TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (host_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    meeting_id INT NOT NULL,
    user_id INT NULL,
    guest_name VARCHAR(100) NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS recordings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    meeting_id INT NOT NULL,
    file_name VARCHAR(100) NOT NULL,
    mime VARCHAR(60) NULL,
    size_bytes BIGINT NOT NULL DEFAULT 0,
    duration_sec INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
);

