from app.services.compatibility import analyze_compatibility, calculate_expression_number, parse_date


def test_calculate_expression_number():
    assert calculate_expression_number("Иван") > 0
    assert calculate_expression_number("Maria") > 0


def test_parse_date_valid():
    parsed = parse_date("15.04.1985")
    assert parsed.day == 15 and parsed.month == 4 and parsed.year == 1985


def test_analyze_compatibility_result_keys():
    result = analyze_compatibility(1, 2, 3, 4)
    assert "expr_compatibility" in result
    assert "path_compatibility" in result
