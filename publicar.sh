#!/usr/bin/env bash
# Publica o jogo para colegas por um túnel HTTPS da Cloudflare, protegido por senha.
#   ./publicar.sh          sobe tudo + túnel e mostra o endereço
#   ./publicar.sh parar    derruba só o túnel (o jogo continua no ar localmente)
#   ./publicar.sh endereco mostra o endereço atual
set -euo pipefail
cd "$(dirname "$0")"

endereco() { docker compose logs tunel 2>/dev/null | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1; }

case "${1:-subir}" in
  parar)
    docker compose --profile publico stop tunel && docker compose --profile publico rm -f tunel
    echo "Túnel encerrado. O jogo segue em http://localhost:8000"; exit 0 ;;
  endereco)
    endereco; exit 0 ;;
esac

[ -f .env ] || { echo "Falta o arquivo .env (copie de .env.example)."; exit 1; }

# Sem senha, o túnel deixaria qualquer pessoa gastar a chave da Anthropic: gera uma senha se faltar.
if ! grep -qE '^ACESSO_SENHA=.+' .env; then
  senha="$(openssl rand -hex 8)"
  printf '\n# Senha única para quem acessa pelo túnel (usuário: hackathon)\nACESSO_USUARIO=hackathon\nACESSO_SENHA=%s\n' "$senha" >> .env
  echo "Senha de acesso criada e guardada no .env (linhas ACESSO_USUARIO e ACESSO_SENHA)."
fi
if grep -qE '^FACILITADOR_CODIGO=(troque-este-codigo)?$' .env; then
  echo "Troque o FACILITADOR_CODIGO no .env antes de publicar."; exit 1
fi

docker compose --profile publico up -d --build
echo -n "Aguardando o endereço público"
for _ in $(seq 1 30); do
  url="$(endereco || true)"; [ -n "$url" ] && break; echo -n "."; sleep 2
done
echo
if [ -z "${url:-}" ]; then echo "O túnel não informou o endereço. Veja: docker compose logs tunel"; exit 1; fi
echo "Jogo publicado em: $url"
echo "Usuário: $(grep -E '^ACESSO_USUARIO=' .env | tail -1 | cut -d= -f2-)   Senha: veja ACESSO_SENHA no .env"
echo "Se o túnel reiniciar, o endereço muda: rode './publicar.sh endereco'."
