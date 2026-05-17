-- Kosovo flag (XK uses regional indicator pair, not a single-country emoji in all fonts).

insert into countries (name, code, slug, emoji)
values ('Kosovo', 'XK', 'kosovo', '🇽🇰')
on conflict (code) do update
set name = excluded.name,
    slug = excluded.slug,
    emoji = excluded.emoji;

update countries
set emoji = '🇽🇰'
where slug = 'kosovo'
   or code = 'XK';
