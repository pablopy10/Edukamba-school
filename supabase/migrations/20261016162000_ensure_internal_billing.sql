-- Garantir que as escolas usam a faturação certificada nativa da AGT no Edukamba
UPDATE public.schools SET usa_faturacao_externa = false;
