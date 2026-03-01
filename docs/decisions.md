# Decisões de arquitetura – ClicVend

## Fase 0: Estratégia de tenant (path-based)

**Decisão:** Uso de **path** `/[slug]/...` para identificar a empresa (tenant). O primeiro segmento da URL é o `slug` da empresa (ex.: `/demo/conversas`, `/acme/contatos`).

**Motivo:** Implementação mais simples que subdomínio (não exige DNS wildcard nem SSL por subdomínio). Subdomínio (ex.: `acme.app.com`) pode ser considerado em iteração futura.

**Referência:** [TECHNICAL-SPEC.md](TECHNICAL-SPEC.md) §2.1.
