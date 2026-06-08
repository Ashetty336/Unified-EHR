-- 001_enums.sql

CREATE TYPE user_role AS ENUM ('patient', 'doctor', 'hospital', 'admin');

CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TYPE consent_status AS ENUM ('pending', 'approved', 'rejected', 'revoked', 'expired');

CREATE TYPE consent_access_type AS ENUM ('full', 'resource_level');

CREATE TYPE requester_type AS ENUM ('doctor', 'hospital');

CREATE TYPE consent_request_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');