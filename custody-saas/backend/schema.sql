-- ============================================================
-- RPNGC Custody Management SaaS - PostgreSQL Schema
-- Multi-tenant: each police station is a "client"
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================
-- SUBSCRIPTION PLANS
-- ============================================================
CREATE TABLE subscription_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(50) NOT NULL UNIQUE,         -- e.g. 'Basic', 'Standard', 'Premium'
  max_officers INT NOT NULL DEFAULT 10,
  max_cells INT NOT NULL DEFAULT 20,
  max_monthly_bookings INT,                 -- NULL = unlimited
  features JSONB DEFAULT '{}',
  price_pgk NUMERIC(10,2) NOT NULL,
  billing_cycle VARCHAR(20) DEFAULT 'monthly', -- monthly | annual
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO subscription_plans (name, max_officers, max_cells, max_monthly_bookings, features, price_pgk) VALUES
  ('Basic',    10,  20,  200,  '{"reports":false,"analytics":false,"api_access":false}',  150.00),
  ('Standard', 30,  60,  1000, '{"reports":true,"analytics":false,"api_access":false}',   400.00),
  ('Premium',  999, 999, NULL, '{"reports":true,"analytics":true,"api_access":true}',    1000.00);

-- ============================================================
-- POLICE STATIONS (TENANTS)
-- ============================================================
CREATE TABLE stations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(20) NOT NULL UNIQUE,         -- e.g. 'BOROKO', 'WAIGANI'
  name VARCHAR(200) NOT NULL,
  province VARCHAR(100),
  district VARCHAR(100),
  address TEXT,
  phone VARCHAR(50),
  email VARCHAR(200),
  plan_id UUID NOT NULL REFERENCES subscription_plans(id),
  subscription_status VARCHAR(20) DEFAULT 'trial',  -- trial | active | suspended | cancelled
  trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
  subscription_starts_at TIMESTAMPTZ,
  subscription_ends_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  settings JSONB DEFAULT '{}',              -- station-level config
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- USERS (Super Admin + Station Officers)
-- ============================================================
CREATE TYPE user_role AS ENUM ('super_admin', 'station_admin', 'senior_officer', 'officer');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  station_id UUID REFERENCES stations(id) ON DELETE CASCADE,  -- NULL = super_admin
  role user_role NOT NULL DEFAULT 'officer',
  badge_number VARCHAR(50),
  full_name VARCHAR(200) NOT NULL,
  email VARCHAR(200) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  rank VARCHAR(100),
  is_active BOOLEAN DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_users_badge_station ON users(station_id, badge_number) WHERE badge_number IS NOT NULL;

-- ============================================================
-- CELLS
-- ============================================================
CREATE TABLE cells (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  station_id UUID NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  cell_number VARCHAR(20) NOT NULL,
  cell_type VARCHAR(50) DEFAULT 'standard',  -- standard | female | juvenile | secure
  capacity INT NOT NULL DEFAULT 4,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(station_id, cell_number)
);

-- ============================================================
-- DETAINEES
-- ============================================================
CREATE TYPE gender_type AS ENUM ('male', 'female', 'other');

CREATE TABLE detainees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  station_id UUID NOT NULL REFERENCES stations(id),
  
  -- Personal info
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  alias VARCHAR(200),
  dob DATE,
  gender gender_type NOT NULL DEFAULT 'male',
  nationality VARCHAR(100) DEFAULT 'Papua New Guinean',
  id_type VARCHAR(50),                      -- NID, Passport, etc.
  id_number VARCHAR(100),
  address TEXT,
  phone VARCHAR(50),
  next_of_kin_name VARCHAR(200),
  next_of_kin_phone VARCHAR(50),
  next_of_kin_relationship VARCHAR(100),
  
  -- Physical description
  height_cm INT,
  weight_kg INT,
  distinguishing_marks TEXT,
  photo_url TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_detainees_station ON detainees(station_id);
CREATE INDEX idx_detainees_name ON detainees USING gin((first_name || ' ' || last_name) gin_trgm_ops);

-- ============================================================
-- BOOKINGS (Custody Records)
-- ============================================================
CREATE TYPE booking_status AS ENUM ('in_custody', 'released', 'transferred', 'court', 'hospital', 'escaped');
CREATE TYPE charge_severity AS ENUM ('summary', 'indictable', 'traffic', 'warrant', 'other');

CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_number VARCHAR(30) NOT NULL,       -- auto-generated: BKG-BOROKO-2024-0001
  station_id UUID NOT NULL REFERENCES stations(id),
  detainee_id UUID NOT NULL REFERENCES detainees(id),
  cell_id UUID REFERENCES cells(id),
  
  -- Arrest details
  arrested_by_id UUID REFERENCES users(id),
  arrested_by_name VARCHAR(200),            -- denormalized for offline
  arrest_date TIMESTAMPTZ NOT NULL,
  arrest_location TEXT,
  arresting_unit VARCHAR(200),
  
  -- Charges
  charge_description TEXT NOT NULL,
  charge_severity charge_severity DEFAULT 'summary',
  section_of_law VARCHAR(500),              -- e.g. "Section 383A CCA" 
  alleged_offence_date DATE,
  
  -- Custody
  status booking_status DEFAULT 'in_custody',
  booked_in_at TIMESTAMPTZ DEFAULT NOW(),
  booked_in_by_id UUID REFERENCES users(id),
  released_at TIMESTAMPTZ,
  released_by_id UUID REFERENCES users(id),
  release_reason TEXT,
  bail_amount NUMERIC(10,2),
  
  -- Court
  court_date DATE,
  court_name VARCHAR(200),
  
  -- Medical
  medical_conditions TEXT,
  medications TEXT,
  medical_checked_at TIMESTAMPTZ,
  medical_checked_by_id UUID REFERENCES users(id),
  
  -- Risk
  risk_level VARCHAR(20) DEFAULT 'low',     -- low | medium | high
  special_instructions TEXT,
  
  -- Sync
  local_id VARCHAR(100),                    -- offline-generated UUID from client
  sync_status VARCHAR(20) DEFAULT 'synced', -- synced | pending | conflict
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_bookings_number ON bookings(station_id, booking_number);
CREATE INDEX idx_bookings_station_status ON bookings(station_id, status);
CREATE INDEX idx_bookings_local_id ON bookings(local_id) WHERE local_id IS NOT NULL;

-- ============================================================
-- CUSTODY LOG (Audit trail of all custody events)
-- ============================================================
CREATE TABLE custody_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  station_id UUID NOT NULL REFERENCES stations(id),
  event_type VARCHAR(50) NOT NULL,          -- booked_in | cell_moved | fed | welfare_check | visitor | court | release
  event_description TEXT,
  performed_by_id UUID REFERENCES users(id),
  performed_by_name VARCHAR(200),
  event_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}',
  local_id VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_custody_log_booking ON custody_log(booking_id);

-- ============================================================
-- WELFARE CHECKS
-- ============================================================
CREATE TABLE welfare_checks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES bookings(id),
  station_id UUID NOT NULL REFERENCES stations(id),
  checked_by_id UUID REFERENCES users(id),
  checked_by_name VARCHAR(200),
  checked_at TIMESTAMPTZ DEFAULT NOW(),
  condition VARCHAR(50),                    -- well | unwell | requires_medical | refused
  notes TEXT,
  local_id VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PROPERTY INVENTORY
-- ============================================================
CREATE TABLE property_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES bookings(id),
  station_id UUID NOT NULL REFERENCES stations(id),
  item_description TEXT NOT NULL,
  quantity INT DEFAULT 1,
  estimated_value_pgk NUMERIC(10,2),
  storage_location VARCHAR(200),
  received_by_id UUID REFERENCES users(id),
  received_at TIMESTAMPTZ DEFAULT NOW(),
  returned_at TIMESTAMPTZ,
  returned_by_id UUID REFERENCES users(id),
  condition_in TEXT,
  condition_out TEXT,
  local_id VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SUBSCRIPTION PAYMENTS
-- ============================================================
CREATE TABLE subscription_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  station_id UUID NOT NULL REFERENCES stations(id),
  plan_id UUID NOT NULL REFERENCES subscription_plans(id),
  amount_pgk NUMERIC(10,2) NOT NULL,
  payment_method VARCHAR(50),               -- bank_transfer | cheque | cash | online
  reference_number VARCHAR(200),
  payment_date DATE NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  recorded_by_id UUID REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SYSTEM AUDIT LOG
-- ============================================================
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  station_id UUID REFERENCES stations(id),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id UUID,
  changes JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SEQUENCES for booking numbers
-- ============================================================
CREATE TABLE booking_sequences (
  station_id UUID PRIMARY KEY REFERENCES stations(id),
  year INT NOT NULL,
  last_seq INT DEFAULT 0,
  UNIQUE(station_id, year)
);

-- ============================================================
-- VIEWS
-- ============================================================
CREATE VIEW v_active_custody AS
SELECT 
  b.id, b.booking_number, b.station_id,
  b.status, b.booked_in_at, b.risk_level,
  b.charge_description, b.cell_id,
  d.first_name || ' ' || d.last_name AS detainee_name,
  d.gender, d.dob,
  c.cell_number,
  s.name AS station_name, s.code AS station_code
FROM bookings b
JOIN detainees d ON b.detainee_id = d.id
LEFT JOIN cells c ON b.cell_id = c.id
JOIN stations s ON b.station_id = s.id
WHERE b.status = 'in_custody';

-- ============================================================
-- FUNCTIONS
-- ============================================================
CREATE OR REPLACE FUNCTION next_booking_number(p_station_id UUID, p_station_code VARCHAR)
RETURNS VARCHAR AS $$
DECLARE
  v_year INT := EXTRACT(YEAR FROM NOW());
  v_seq INT;
BEGIN
  INSERT INTO booking_sequences (station_id, year, last_seq) 
  VALUES (p_station_id, v_year, 1)
  ON CONFLICT (station_id, year) DO UPDATE SET last_seq = booking_sequences.last_seq + 1
  RETURNING last_seq INTO v_seq;
  
  RETURN 'BKG-' || p_station_code || '-' || v_year || '-' || LPAD(v_seq::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Update updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_stations_updated BEFORE UPDATE ON stations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_detainees_updated BEFORE UPDATE ON detainees FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_bookings_updated BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION update_updated_at();
