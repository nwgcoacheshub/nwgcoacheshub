-- NWG Coaches Hub — Rota Tool, WAG/MAG grade class expansion
-- Adds 18 new rota_class_catalogue entries (10 WAG grade classes, 7 MAG grade
-- classes, and Floor & Vault) plus the 2 new rota_categories rows they need.
-- 'excel' is shared between WAG Excel and MAG Excel per Jamie's decision that
-- matching grade names share one colour. 'floorVault' is its own category.
-- Only additive — no existing row in either table is modified.

insert into public.rota_categories (key, label, color_hex, sort_order, active) values
('excel', 'Excel', '#1B3A6B', 21, true),
('floorVault', 'Floor & Vault', '#2E8B78', 22, true);

insert into public.rota_class_catalogue (title, category_key, default_meta, default_duration_mins, active, sort_order) values
('WAG Excel', 'excel', null, 60, true, 17),
('WAG Amber', 'amber', null, 60, true, 18),
('WAG Amethyst', 'amethyst', null, 60, true, 19),
('WAG Turquoise', 'wagTurquoise', null, 60, true, 20),
('WAG Opal', 'opal', null, 60, true, 21),
('WAG Quartz', 'quartz', null, 60, true, 22),
('WAG Pearl', 'wagPearl', null, 60, true, 23),
('WAG Bronze', 'wagBronze', null, 60, true, 24),
('WAG Silver', 'wagSilver', null, 60, true, 25),
('WAG Gold', 'wagGold', null, 60, true, 26),
('MAG Excel', 'excel', null, 60, true, 27),
('MAG Amethyst', 'amethyst', null, 60, true, 28),
('MAG Turquoise', 'wagTurquoise', null, 60, true, 29),
('MAG Pearl', 'wagPearl', null, 60, true, 30),
('MAG Bronze', 'wagBronze', null, 60, true, 31),
('MAG Silver', 'wagSilver', null, 60, true, 32),
('MAG Gold', 'wagGold', null, 60, true, 33),
('Floor & Vault', 'floorVault', null, 60, true, 34);
