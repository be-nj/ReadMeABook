-- Multi-library routing target, resolved at request time from the matching shelf.
ALTER TABLE "audiobooks" ADD COLUMN "shelf_media_path" TEXT;
ALTER TABLE "audiobooks" ADD COLUMN "shelf_library_id" TEXT;
