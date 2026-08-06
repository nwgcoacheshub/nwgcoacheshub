-- NWG Coaches Hub — Rota Tool, rota_categories cleanup
-- The original seed (0002_rota_schema.sql) pulled category names straight out of
-- the original HTML mock's placeholder CSS on the wrong assumption they were all
-- real. 'fun' (Fun Session) and 'turquoiseSquad' (Turquoise Squad) were never real
-- classes and are removed. Remaining gem-squad rows drop "Squad" from their label
-- (key is unchanged in every case — only label and sort_order move).
--
-- Verified before writing this migration: zero rows in rota_class_catalogue,
-- rota_standard_classes, or rota_weekly_classes reference category_key = 'fun' or
-- category_key = 'turquoiseSquad' (checked against the live database, not just
-- this repo's seed data).

delete from public.rota_categories where key in ('fun', 'turquoiseSquad');

update public.rota_categories set label = 'Ruby' where key = 'ruby';
update public.rota_categories set label = 'Sapphire' where key = 'sapphire';
update public.rota_categories set label = 'Emerald' where key = 'emerald';
update public.rota_categories set label = 'Topaz' where key = 'topaz';
update public.rota_categories set label = 'Onyx' where key = 'onyx';
update public.rota_categories set label = 'Diamond' where key = 'diamond';
update public.rota_categories set label = 'Amethyst' where key = 'amethyst';
update public.rota_categories set label = 'Quartz' where key = 'quartz';
update public.rota_categories set label = 'Amber' where key = 'amber';
update public.rota_categories set label = 'Opal' where key = 'opal';
update public.rota_categories set label = 'Bronze' where key = 'bronzeSquad';
update public.rota_categories set label = 'Silver' where key = 'silverSquad';

-- Renumber sort_order contiguously now that 'fun' (was 4) and 'turquoiseSquad'
-- (was 20) are gone.
update public.rota_categories set sort_order = 1 where key = 'tumblers';
update public.rota_categories set sort_order = 2 where key = 'openplay';
update public.rota_categories set sort_order = 3 where key = 'flippers';
update public.rota_categories set sort_order = 4 where key = 'wagGold';
update public.rota_categories set sort_order = 5 where key = 'wagSilver';
update public.rota_categories set sort_order = 6 where key = 'wagBronze';
update public.rota_categories set sort_order = 7 where key = 'wagPearl';
update public.rota_categories set sort_order = 8 where key = 'wagTurquoise';
update public.rota_categories set sort_order = 9 where key = 'ruby';
update public.rota_categories set sort_order = 10 where key = 'sapphire';
update public.rota_categories set sort_order = 11 where key = 'emerald';
update public.rota_categories set sort_order = 12 where key = 'topaz';
update public.rota_categories set sort_order = 13 where key = 'onyx';
update public.rota_categories set sort_order = 14 where key = 'diamond';
update public.rota_categories set sort_order = 15 where key = 'amethyst';
update public.rota_categories set sort_order = 16 where key = 'quartz';
update public.rota_categories set sort_order = 17 where key = 'amber';
update public.rota_categories set sort_order = 18 where key = 'opal';
update public.rota_categories set sort_order = 19 where key = 'bronzeSquad';
update public.rota_categories set sort_order = 20 where key = 'silverSquad';
