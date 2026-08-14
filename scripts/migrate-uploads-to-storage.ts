/** Đẩy ảnh trong uploads/ lên Supabase Storage. Chạy một lần. */
import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const dir = process.env.UPLOADS_DIR ?? "./uploads";
const bucketName = process.env.SUPABASE_STORAGE_BUCKET ?? "photos";
const client = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

const files = await readdir(dir);
let ok = 0;
for (const name of files) {
  const type = TYPES[extname(name).toLowerCase()];
  if (!type) {
    console.log(`bỏ qua (không phải ảnh): ${name}`);
    continue;
  }
  const body = await readFile(join(dir, name));
  const { error } = await client.storage
    .from(bucketName)
    .upload(name, body, { contentType: type, upsert: true });
  if (error) console.error(`LỖI ${name}: ${error.message}`);
  else {
    ok++;
    console.log(`đã đẩy: ${name}`);
  }
}
console.log(`Xong: ${ok}/${files.length} file.`);
