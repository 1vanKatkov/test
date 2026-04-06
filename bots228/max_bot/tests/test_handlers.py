from handlers import handle_update


class DummyClient:
    def __init__(self):
        self.sent = []

    def build_open_app_button(self, url: str, title: str = "Открыть приложение"):
        return {"text": title, "web_app": {"url": url}}

    def send_message(self, chat_id: str, text: str, buttons=None):
        self.sent.append({"chat_id": chat_id, "text": text, "buttons": buttons})
        return {"ok": True}


def test_start_event_is_handled():
    client = DummyClient()
    result = handle_update({"type": "start", "chat_id": "42"}, client)
    assert result["handled"] is True
    assert client.sent[0]["chat_id"] == "42"


def test_non_start_event_is_skipped():
    client = DummyClient()
    result = handle_update({"message": {"chat": {"id": 42}, "text": "hello"}}, client)
    assert result["handled"] is False
