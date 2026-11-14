# Identidade visual

Inspirada no manual da marca CACB ("Apresentação da logomarca", 14/03/2023, [PDF público](https://cacb.org.br/wp-content/uploads/2023/03/CACB_Apresentacao-logomarca-14032023.pdf)): fundo branco ou cinza claro, filete fino com linha de metadados em versalete, azul dominante e títulos em sans geométrica. Não usamos a logomarca da CACB: o ícone do app é um monograma próprio ("LJ").

Todas as cores estão em variáveis CSS no início de [`orquestrador/frontend/styles.css`](../orquestrador/frontend/styles.css). Nenhuma cor fica solta nas telas.

## Cores oficiais (manual, p. 51)

| Variável | Nome no manual | HEX | RGB | CMYK | Pantone |
|---|---|---|---|---|---|
| `--cacb-primaria` | Blue Eyes | `#0067BE` | 0 103 190 | 93 55 0 0 | 2144 C / 300 U |
| `--cacb-destaque` | Lightning Yellow | `#FFB81C` | 255 184 28 | 0 25 94 0 | 1235 C / 116 U |
| `--cacb-secundaria` | Pine Green | `#008368` | 0 131 104 | 100 0 67 17 | 3288 C / 3536 U |

## Derivadas (mistura da cor oficial com preto ou branco)

| Variável | HEX | Origem | Uso |
|---|---|---|---|
| `--cacb-primaria-escura` | `#00437C` | Blue Eyes + 35% preto | Botão pressionado, títulos |
| `--cacb-primaria-clara` | `#EBF3FA` | Blue Eyes + 92% branco | Fundos de destaque, avatares |
| `--cacb-secundaria-escura` | `#006F58` | Pine Green + 15% preto | Sucesso em texto pequeno |
| `--cacb-secundaria-clara` | `#E6F3F0` | Pine Green + 90% branco | Fundo de "obtida" e "ok" |
| `--cacb-destaque-claro` | `#FFF4DD` | Lightning Yellow + 85% branco | Fundo de alerta suave |
| `--cacb-destaque-texto` | `#73530D` | Lightning Yellow + 55% preto | Texto sobre o amarelo |

## Neutras e estados

`#FFFFFF` (superfície), `#F5F6F8` (fundo), `#DDE1E7` (borda), `#B8C0CC` (borda forte), `#1A2230` (texto), `#4B5565` (texto suave), `#B42318` (erro) e `#FDECEA` (fundo de erro).

## Contraste (WCAG 2.1)

| Combinação | Razão | Resultado |
|---|---|---|
| Branco sobre `#0067BE` | 5,70 | AA |
| `#008368` sobre branco | 4,72 | AA |
| `#1A2230` sobre `#FFB81C` | 9,22 | AAA |
| Branco sobre `#FFB81C` | 1,73 | **Reprovado**: o amarelo só aparece como fundo, com texto escuro, ou como filete |

## Tipografia, ícones e avatares

* **Inter** (SIL Open Font License), servida pelo próprio app e disponível offline. Licença em `frontend/vendor/fontes/OFL.txt`.
* **Lucide** v0.460.0 (licença ISC), ícones de linha. Licença em `frontend/vendor/icones/LICENSE.txt`. Nenhum emoji é usado como ícone.
* **Avatares** próprios em SVG: busto profissional com 4 posturas (apoia, neutro, em dúvida, contra) e um indicador de status que combina cor e ícone, para não depender só da cor.
