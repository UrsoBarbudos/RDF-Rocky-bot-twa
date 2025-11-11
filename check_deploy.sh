#!/bin/bash
echo "🔍 Проверка статуса Cloudflare Pages..."
echo "URL: https://b1a59776.rdf-rocky-bot-twa.pages.dev/profile/profile.html"
echo ""
curl -I "https://b1a59776.rdf-rocky-bot-twa.pages.dev/profile/profile.html" 2>/dev/null | head -5
echo ""
echo "Время проверки: $(date)"
