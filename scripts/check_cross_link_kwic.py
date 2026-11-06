"""Read-only regression: real KWIC matching for blank-lemma cross-link inputs."""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from services.collocation.kwic_service import KWICService

service = KWICService()
for word in ['广绣', 'dogs', 'hunde', 'huizen', 'lapset', 'chevaux', 'ragazzi', 'livros', 'кошки', 'niños', 'hundar']:
    tokens = [{'text': word, 'word_lower': word.lower(), 'lemma': '', 'lemma_lower': '', 'pos': 'NOUN'}]
    assert len(service._search_simple(tokens, word, 5, True, None)) == 1, word
    assert len(service._search_word(tokens, word, 5, True, None)) == 1, word
    assert not service._search_lemma(tokens, word, 5, True, None), word
english = [{'text': 'dogs', 'word_lower': 'dogs', 'lemma': 'dog', 'lemma_lower': 'dog', 'pos': 'NOUN'}]
assert len(service._search_lemma(english, 'dog', 5, True, None)) == 1
phrase = [{'text': w, 'word_lower': w, 'lemma': w, 'lemma_lower': w, 'pos': 'NOUN'} for w in ['cultural', 'heritage']]
assert len(service._search_simple(phrase, 'cultural heritage', 5, True, None)) == 1
print('PASS: eleven-language raw-text KWIC matches, absent-lemma contrast, preserved English lemma and multiword annotation spans. No database/model/user data changes.')
