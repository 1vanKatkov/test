from pydantic import BaseModel, Field


class SonnikRequest(BaseModel):
    dream_text: str = Field(min_length=3, max_length=4000)
    language: str = Field(default="", max_length=8)


class NumerologyRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=200)
    birth_date: str = Field(min_length=10, max_length=10)
    language: str = Field(default="", max_length=8)


class SovmestimostNamesRequest(BaseModel):
    name1: str = Field(min_length=2, max_length=100)
    name2: str = Field(min_length=2, max_length=100)
    language: str = Field(default="", max_length=8)


class SovmestimostNamesDatesRequest(BaseModel):
    name1: str = Field(default="", max_length=100)
    date1: str = Field(default="", max_length=10)
    name2: str = Field(default="", max_length=100)
    date2: str = Field(default="", max_length=10)
    persona1_id: int = Field(default=0, ge=0)
    persona1_name: str = Field(default="", max_length=100)
    persona1_birth_date: str = Field(default="", max_length=10)
    persona1_birth_time: str = Field(default="", max_length=5)
    persona1_birth_place: str = Field(default="", max_length=120)
    persona1_note: str = Field(default="", max_length=1000)
    persona2_id: int = Field(default=0, ge=0)
    persona2_name: str = Field(default="", max_length=100)
    persona2_birth_date: str = Field(default="", max_length=10)
    persona2_birth_time: str = Field(default="", max_length=5)
    persona2_birth_place: str = Field(default="", max_length=120)
    persona2_note: str = Field(default="", max_length=1000)
    language: str = Field(default="", max_length=8)


class TarotRequest(BaseModel):
    question: str = Field(default="", max_length=1000)
    topic: str = Field(default="full_portrait", max_length=64)
    spread: str = Field(default="natal_map", max_length=32)
    persona_id: int = Field(default=0, ge=0)
    persona_name: str = Field(default="", max_length=100)
    persona_birth_date: str = Field(default="", max_length=10)
    persona_birth_time: str = Field(default="", max_length=5)
    persona_birth_place: str = Field(default="", max_length=120)
    persona_note: str = Field(default="", max_length=1000)
    language: str = Field(default="", max_length=8)


class TarotCardReadingRequest(BaseModel):
    question: str = Field(default="", max_length=1000)
    spread: str = Field(default="three_cards", max_length=32)
    selected_card_ids: list[str] = Field(default_factory=list, max_length=3)
    draw_token: str = Field(default="", max_length=2000)
    language: str = Field(default="", max_length=8)


class TarotCardDrawRequest(BaseModel):
    spread: str = Field(default="three_cards", max_length=32)
    language: str = Field(default="", max_length=8)


class PersonaCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    birth_date: str = Field(min_length=8, max_length=10)
    birth_time: str = Field(min_length=5, max_length=5)
    birth_place: str = Field(min_length=1, max_length=120)
    note: str = Field(default="", max_length=1000)


class PersonaUpdateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    birth_date: str = Field(min_length=8, max_length=10)
    birth_time: str = Field(min_length=5, max_length=5)
    birth_place: str = Field(min_length=1, max_length=120)
    note: str = Field(default="", max_length=1000)


class AstrologyForecastRequest(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    birth_date: str = Field(min_length=8, max_length=10)
    birth_time: str = Field(min_length=5, max_length=5)
    birth_place: str = Field(min_length=1, max_length=120)
    focus: str = Field(default="", max_length=1000)
    language: str = Field(default="", max_length=8)


class EmailRegisterStartRequest(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=8, max_length=128)
    password_confirm: str = Field(min_length=8, max_length=128)
    language: str = Field(default="ru", max_length=8)


class EmailRegisterVerifyRequest(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    code: str = Field(min_length=6, max_length=6)
    language: str = Field(default="ru", max_length=8)


class EmailLoginRequest(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=8, max_length=128)


class EmailResendRequest(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    language: str = Field(default="ru", max_length=8)


class EmailPasswordResetConfirmRequest(BaseModel):
    code: str = Field(min_length=6, max_length=6)
    new_password: str = Field(min_length=8, max_length=128)
    password_confirm: str = Field(min_length=8, max_length=128)


class TelegramVerifyRequest(BaseModel):
    init_data: str = Field(min_length=20, max_length=8000)


class TelegramLinkVerifyRequest(BaseModel):
    link_token: str = Field(min_length=20, max_length=12000)


class TelegramMintUsernameLinkRequest(BaseModel):
    username: str = Field(min_length=1, max_length=32)


class SupportCreateTicketRequest(BaseModel):
    subject: str = Field(min_length=3, max_length=200)
    message_text: str = Field(min_length=3, max_length=4000)


class SupportAddMessageRequest(BaseModel):
    message_text: str = Field(min_length=1, max_length=4000)


class YooKassaCreatePaymentRequest(BaseModel):
    package_id: str = Field(min_length=3, max_length=64)
    receipt_email: str = Field(min_length=5, max_length=254)


class AdminAdjustCreditsRequest(BaseModel):
    user_id: int = Field(gt=0)
    amount: int = Field(ge=-100000, le=100000)
    reason: str = Field(default="admin_adjustment", min_length=1, max_length=200)


class AdminSetRoleRequest(BaseModel):
    role: str = Field(pattern="^(user|admin)$")


class AdminSupportReplyRequest(BaseModel):
    message_text: str = Field(min_length=1, max_length=4000)


class AdminTicketStatusRequest(BaseModel):
    status: str = Field(pattern="^(open|closed)$")

