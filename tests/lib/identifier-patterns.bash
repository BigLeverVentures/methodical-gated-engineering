# Public identifier patterns, sourced by no-personal-identifiers.sh and skills-frontmatter.sh so the
# list lives in one place. Generic shapes only: the full list is itself personal and stays
# in the gitignored .private/identifiers.txt. Patterns are split across quotes so this file does not
# match itself. The \$[0-9] shape catches dollar amounts.
# shellcheck disable=SC2034
shapes=(
  '/Use''rs/[^[:space:]]+'
  '/ho''me/[^[:space:]]+'
  '~/\.cla''ude/CLAUDE\.md'
  '\$''[0-9]'   # dollar amounts
  '[Tt]ea''m[^A-Za-z0-9]{1,12}([Ii][Dd][^A-Za-z0-9]{1,4})?[A-Z0-9]{10}([^A-Za-z0-9]|$)'
)
names=(
  'Chri''s Myers'
  'Big ?Leve''r Ventures'
  'BigLeve''rVentures'
)
