# Conversation language and repetitive laughter — targeted content UX review

## Grounding
The user supplied a Tinder conversation screenshot showing alternating French and Latin-script
Moroccan Darija, including a later Darija-forward incoming reply, while three successive
AI outgoing turns repeatedly included the same laugh filler. Do not add private
match messages, images, handles or identities to the repository.

## Desired behavior
- Detect clear shifts in the **latest match turn**, not merely the global profile's
  French/Darija/English weight mixture. One borrowed word is insufficient evidence.
- Preserve the owner's baseline and explicit per-chat language override. Follow
  natural code-switching, not fixed percentages or artificial Darija phrases.
- Make humor reciprocal but do not automatically echo `hhh` as `haha`;
  suppress a laugh filler when the sender has already used one recently.
- Apply this consistently to extension background (server and offline/local fallback)
  and Web conversation drafts. Keep all send/permission gates unchanged.

## Technical scope and limitations
A conservative local style cue extractor supplies generation instructions, and a
post-generation guard removes formulaic repeated standalone laughter tokens.
No extra Gemini calls or user-profile writes. Semantic paraphrase, dialect
quality and aesthetic naturalness still require human review of actual drafts.
The tests use synthetic chat lines and never send live Tinder messages.
