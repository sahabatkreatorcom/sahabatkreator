-- Tambah platform "shopee" ke enum platform (akun marketplace via bridge Repliz).
-- Dipakai add-on riset produk Shopee, bukan publish post sosial.
ALTER TYPE "platform" ADD VALUE IF NOT EXISTS 'shopee';
