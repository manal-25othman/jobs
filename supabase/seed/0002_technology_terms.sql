-- Demo fixture: technology vocabulary for the Frontend track pack. Data, not code (D-076).
insert into technology_term (term, aliases, category, provenance_source, is_demo_fixture) values
  ('React', '{ReactJS,React.js}', 'framework', 'demo fixture: trk_frontend_junior', true),
  ('Vue', '{Vue.js,VueJS}', 'framework', 'demo fixture: trk_frontend_junior', true),
  ('Angular', '{}', 'framework', 'demo fixture: trk_frontend_junior', true),
  ('Next.js', '{NextJS}', 'framework', 'demo fixture: trk_frontend_junior', true),
  ('TypeScript', '{}', 'language', 'demo fixture: trk_frontend_junior', true),
  ('JavaScript', '{JS}', 'language', 'demo fixture: trk_frontend_junior', true),
  ('Jest', '{}', 'library', 'demo fixture: trk_frontend_junior', true),
  ('Vitest', '{}', 'library', 'demo fixture: trk_frontend_junior', true),
  ('Testing Library', '{React Testing Library}', 'library', 'demo fixture: trk_frontend_junior', true),
  ('Node.js', '{NodeJS,Node}', 'platform', 'demo fixture: trk_frontend_junior', true),
  ('Django', '{}', 'framework', 'demo fixture: generic', true),
  ('Spring', '{Spring Boot}', 'framework', 'demo fixture: generic', true),
  ('Python', '{}', 'language', 'demo fixture: generic', true),
  ('Redux', '{}', 'library', 'demo fixture: trk_frontend_junior', true),
  ('Tailwind', '{TailwindCSS}', 'library', 'demo fixture: trk_frontend_junior', true)
on conflict (term) do nothing;
