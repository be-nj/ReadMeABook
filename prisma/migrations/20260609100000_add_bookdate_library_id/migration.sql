-- Per-user BookDate library selection: which library to draw recommendations
-- from. NULL = all configured libraries (union).
ALTER TABLE "users" ADD COLUMN "bookdate_library_id" TEXT;
